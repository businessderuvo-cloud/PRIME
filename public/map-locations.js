export const statuses=['in vendita','in affitto','in trattativa','opportunità','altra agenzia','acquisito','preparazione','venduto','locato','censito'];
export const labelStatus=value=>({'in vendita':'In vendita','in affitto':'In affitto','in trattativa':'In trattativa','opportunità':'Opportunità','altra agenzia':'Altra agenzia','acquisito':'In gestione','preparazione':'In preparazione','venduto':'Venduto','locato':'Locato','censito':'Censito'}[value]||value);
export const houseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function unitStatus(unit){return ['in vendita','in affitto','altra agenzia'].includes(unit?.commercial_status)?unit.commercial_status:['opportunità','acquisito'].includes(unit?.acquisition_status)?unit.acquisition_status:'censito';}
export function propertyStatus(property,unit){return property.marketing_status==='preparazione'&&unit?.acquisition_status==='acquisito'?'acquisito':statuses.includes(property.marketing_status)?property.marketing_status:unitStatus(unit);}
export function buildMapLocations(d,t=value=>value){
 const streets=new Map(d.streets.map(r=>[r.id,r])),buildings=new Map(d.buildings.map(r=>[r.id,r])),units=new Map(d.units.map(r=>[r.id,r]));
 const linkedUnits=new Set(d.properties.map(r=>r.unit_id)),locations=[];
 const streetAddress=(street,building)=>[street?.title,building?.title,street?.city].filter(Boolean).join(', ');
 const position=(row,building)=>Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)?{latitude:row.latitude,longitude:row.longitude}:{latitude:building?.latitude,longitude:building?.longitude,inherited:true};
 for(const building of d.buildings){
  const street=streets.get(building.street_id),residents=d.units.filter(r=>r.building_id===building.id),ids=new Set(residents.map(r=>r.id));
  const flags=new Set([...residents.filter(r=>!linkedUnits.has(r.id)).map(unitStatus),...d.properties.filter(r=>ids.has(r.unit_id)).map(r=>propertyStatus(r,units.get(r.unit_id)))]);
  const priority=['in trattativa','in vendita','in affitto','opportunità','altra agenzia','acquisito','preparazione','venduto','locato','censito'];
  locations.push({entity:'buildings',row:building,id:building.id,title:t('Civico')+' '+building.title,address:streetAddress(street,building),geocodeAddress:streetAddress(street,building),building_id:building.id,...position(building),agent_id:residents.find(r=>r.assigned_agent_id)?.assigned_agent_id||'',status:priority.find(r=>flags.has(r))||'censito',price:0,category:'territory',search:[building.search_text,street?.title,street?.city,...residents.map(r=>r.title+' '+r.floor+' '+r.staircase)].join(' '),detail:residents.length+' '+t(residents.length===1?'appartamento censito':'appartamenti censiti')});
 }
 for(const unit of d.units.filter(r=>!linkedUnits.has(r.id))){
  const building=buildings.get(unit.building_id),street=streets.get(building?.street_id);
  locations.push({entity:'units',row:unit,id:unit.id,title:t('Interno')+' '+String(unit.title).replace(/^interno\s+/i,''),address:streetAddress(street,building),geocodeAddress:streetAddress(street,building),building_id:building?.id,positionEntity:'buildings',positionRow:building,...position({},building),agent_id:unit.assigned_agent_id||'',status:unitStatus(unit),price:0,property_type:unit.property_type||'',category:'properties',hot:!!unit.is_hot_lead,search:[unit.search_text,street?.title,street?.city].join(' '),detail:[unit.property_type||t('Appartamento censito'),unit.floor?t('piano')+' '+unit.floor:'',unit.area?unit.area+' m²':''].filter(Boolean).join(' · ')});
 }
 for(const property of d.properties){
  const unit=units.get(property.unit_id),building=buildings.get(unit?.building_id),street=streets.get(building?.street_id),owner=d.contacts.find(r=>r.id===property.owner_id);
  locations.push({entity:'properties',row:property,id:property.id,title:property.title,address:streetAddress(street,building),geocodeAddress:streetAddress(street,building),building_id:building?.id,...position(property,building),agent_id:property.assigned_agent_id||unit?.assigned_agent_id||owner?.assigned_agent_id||'',status:propertyStatus(property,unit),price:property.price||0,property_type:unit?.property_type||'',category:'properties',hot:!!(unit?.is_hot_lead||owner?.is_hot_lead),search:[property.search_text,unit?.search_text,building?.search_text,street?.title,street?.city,owner?.title].join(' '),detail:[t(unit?.property_type||'Immobile'),unit?.title,unit?.floor?t('piano')+' '+unit.floor:'',unit?.area?unit.area+' m²':'',owner?.title].filter(Boolean).join(' · ')});
 }
 return locations;
}
