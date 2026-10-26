import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { schema } from '../public/schema.js';
import { ApiError } from './validation.mjs';
import { transaction } from './database.mjs';

export const importEntities=['streets','buildings','units','contacts','properties','buyer_profiles'];
export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'');
  let comma=0,semi=0,inQuotes=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(inQuotes&&text[i+1]==='"')i++;else inQuotes=!inQuotes;}else if(!inQuotes){if(c==='\n'||c==='\r')break;if(c===',')comma++;if(c===';')semi++;}}
  const delimiter=semi>comma?';':',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!cell||quoted)quoted=!quoted;else throw new ApiError(400,'Virgolette CSV non valide');}
    else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;
  }if(quoted)throw new ApiError(400,'Campo CSV non chiuso');row.push(cell);if(row.some(Boolean))rows.push(row);return rows;
}
export async function parseImport(filename, bytes) {
  let rows;
  if(/\.csv$/i.test(filename))rows=parseCSV(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  else if(/\.xlsx$/i.test(filename)){
    // Reject large expanded ZIPs before the workbook parser allocates their contents.
    let expanded=0,entries=0;
    for(let i=0;i+46<=bytes.length;i++)if(bytes.readUInt32LE(i)===0x02014b50){expanded+=bytes.readUInt32LE(i+24);entries++;if(expanded>32*1024*1024||entries>2000)throw new ApiError(413,'Cartella XLSX troppo grande');}
    if(!entries)throw new ApiError(400,'File XLSX non valido');
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);const sheet=workbook.worksheets[0];
    if(!sheet || sheet.rowCount>2001 || sheet.columnCount>100)throw new ApiError(400,'Massimo 2000 righe e 100 colonne nel primo foglio');
    rows=[];sheet.eachRow(row=>{const values=[];for(let c=1;c<=sheet.columnCount;c++){const v=row.getCell(c).value;if(v&&typeof v==='object'&&('formula'in v||'sharedFormula'in v))throw new ApiError(400,'Formule non consentite: esporta solo i valori');values.push(v instanceof Date?v.toISOString().slice(0,10):v&&typeof v==='object'?String(v.text??v.richText?.map(x=>x.text).join('')??''):String(v??''));}rows.push(values);});
  }else throw new ApiError(400,'Usa un file CSV UTF-8 o XLSX');
  if(!rows?.length||rows.length>2001||rows.some(x=>x.length>100))throw new ApiError(400,'File vuoto o oltre 2000 righe / 100 colonne');
  const headers=rows.shift().map(x=>x.trim());if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw new ApiError(400,'Intestazioni vuote o duplicate');
  return {headers,rows:rows.map((values,i)=>{if(values.length>headers.length)throw new ApiError(400,`Riga ${i+2}: troppe colonne`);return Object.fromEntries(headers.map((h,j)=>[h,values[j]??'']));})};
}

export function importService({db,previewEntity,saveEntity,audit}) {
  function duplicate(entity,data,s,extra=[]) {
    const norm=x=>String(x??'').trim().toLocaleLowerCase('it');
    const list=[...db.prepare(`SELECT * FROM ${entity} WHERE tenant_id=?`).all(s.tenant_id),...extra];
    const same=(a,b,keys)=>keys.every(k=>norm(a[k])===norm(b[k]));
    return list.some(x=>{
      if(entity==='contacts')return (data.email&&norm(x.email)===norm(data.email))||(data.phone&&x.phone===data.phone)||same(x,data,['title']);
      const keys={streets:['city','title'],buildings:['street_id','title'],units:['building_id','staircase','floor','title'],properties:data.unit_id?['unit_id']:['title','owner_id'],buyer_profiles:['contact_id','title']}[entity];
      return same(x,data,keys);
    });
  }
  function preview(s,body) {
    const {entity,rows,mapping}=body;
    if(!importEntities.includes(entity)||!Array.isArray(rows)||rows.length>2000||!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw new ApiError(400,'Importazione non valida');
    if(Object.keys(mapping).some(k=>!schema[entity].fields[k])||Object.values(mapping).some(x=>typeof x!=='string'))throw new ApiError(400,'Mappatura non valida');
    const accepted=[];
    const report=rows.map((row,i)=>{try{
      const data={};for(const [field,column]of Object.entries(mapping)){if(!column)continue;let value=row[column]??'';const f=schema[entity].fields[field];if(f.type==='number'&&typeof value==='string'&&value.trim()){value=value.replace(/\s|€/g,'');if(value.includes(','))value=value.replace(/\./g,'').replace(',','.');}if(f.type==='checkbox')value=['1','true','sì','si','yes'].includes(String(value).toLowerCase())?1:0;data[field]=value;}
      for(const [field,value]of Object.entries(data)) {
        const f=schema[entity].fields[field];if(f.type!=='ref'||!value)continue;
        const candidates=f.entity==='members'?db.prepare("SELECT u.id,u.email title FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? AND m.role<>'external'").all(s.tenant_id):db.prepare(`SELECT * FROM ${f.entity} WHERE tenant_id=?`).all(s.tenant_id);
        const byId=candidates.find(x=>x.id===value);
        if(byId)continue;
        const found=candidates.filter(x=>[x.title,x.email].filter(Boolean).some(label=>label.toLocaleLowerCase('it')===String(value).trim().toLocaleLowerCase('it')));
        if(found.length!==1)throw new ApiError(400,`${f.label}: collegamento assente o ambiguo; usa l'ID PRIME`);
        data[field]=found[0].id;
      }
      const validated=previewEntity(entity,{data},s);const dup=duplicate(entity,validated,s,accepted);if(!dup)accepted.push(validated);
      return {row:i+2,status:dup?'duplicate':'ready',data:validated};
    }catch(e){return {row:i+2,status:'invalid',error:e.status?e.message:'Dati non validi'};}});
    const id=randomUUID();db.prepare('DELETE FROM import_previews WHERE created_at<?').run(Date.now()-86400000);
    db.prepare('INSERT INTO import_previews VALUES (?,?,?,?,?,?,NULL)').run(id,s.tenant_id,s.user_id,entity,JSON.stringify(report),Date.now());
    audit(s,'import.preview',id);return {id,entity,report,ready:report.filter(x=>x.status==='ready').length};
  }
  function commit(s,id){return transaction(db,()=>{
    const p=db.prepare('SELECT * FROM import_previews WHERE id=? AND tenant_id=? AND user_id=?').get(id,s.tenant_id,s.user_id);
    if(!p||p.created_at<Date.now()-3600000)throw new ApiError(410,'Anteprima scaduta: ripeti la validazione');
    if(p.committed_at)throw new ApiError(409,'Importazione già eseguita');
    const report=JSON.parse(p.payload);if(report.some(x=>x.status==='invalid'))throw new ApiError(400,'Correggi le righe non valide prima di importare');
    let inserted=0,skipped=0;
    for(const row of report){if(row.status==='duplicate'||duplicate(p.entity,row.data,s)){skipped++;continue;}saveEntity(p.entity,{data:row.data},s);inserted++;}
    db.prepare('UPDATE import_previews SET committed_at=? WHERE id=?').run(Date.now(),id);audit(s,'import.commit',id);return {inserted,skipped};
  });}
  return {preview,commit};
}
