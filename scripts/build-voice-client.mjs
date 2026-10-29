import fs from 'node:fs';import {build} from 'esbuild';
fs.mkdirSync('public/vendor/elevenlabs',{recursive:true});
await build({stdin:{contents:"export { Conversation, Scribe, AudioFormat, CommitStrategy, RealtimeEvents } from '@elevenlabs/client';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'linked',outfile:'public/vendor/elevenlabs/client.js'});
for(const file of ['rawAudioProcessor.js','audioConcatProcessor.js'])fs.copyFileSync('node_modules/@elevenlabs/client/worklets/'+file,'public/vendor/elevenlabs/'+file);
fs.copyFileSync('node_modules/@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js','public/vendor/elevenlabs/libsamplerate.worklet.js');
const pkg=JSON.parse(fs.readFileSync('node_modules/@elevenlabs/client/package.json'));console.log('Browser SDK bundled: '+pkg.version);

const notices=[];const visited=new Set();function license(name){if(visited.has(name))return;visited.add(name);const dir='node_modules/'+name;if(!fs.existsSync(dir+'/package.json'))return;const p=JSON.parse(fs.readFileSync(dir+'/package.json'));const file=fs.readdirSync(dir).find(f=>/^licen[sc]e(?:\.|$)/i.test(f));notices.push(p.name+' '+p.version+'\n'+(file?fs.readFileSync(dir+'/'+file,'utf8'):'License: '+p.license));for(const d of Object.keys(p.dependencies||{}))license(d);}license('@elevenlabs/client');license('@alexanderolsen/libsamplerate-js');fs.writeFileSync('public/vendor/elevenlabs/client.js.LEGAL.txt',notices.join('\n\n'));
