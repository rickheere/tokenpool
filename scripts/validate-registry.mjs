import {readdir,readFile} from 'node:fs/promises';
const offline=process.argv.includes('--offline');
let count=0;
for(const file of await readdir('registry')){
 if(!file.endsWith('.json'))continue;
 const entry=JSON.parse(await readFile('registry/'+file,'utf8'));
 const match=/^https:\/\/github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/.exec(entry.repository||'');
 if(!match||file!==`${match[1]}--${match[2]}.json`)throw new Error(`Invalid registry entry: ${file}`);
 if(!offline){
  const r=await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/contents/.github/tokenpool.json`,{headers:{'User-Agent':'Tokenpool-registry',...(process.env.GITHUB_TOKEN?{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}:{})}});
  if(!r.ok)throw new Error(`${file}: configuration could not be read (${r.status})`);
  const item=await r.json(),config=JSON.parse(Buffer.from(item.content,'base64').toString());
  if(config.version!==1||config.enabled!==true||typeof config.instructions!=='string')throw new Error(`${file}: invalid or disabled configuration`);
 }
 count++;
}
console.log(`Validated ${count} registry entries${offline?' (offline)':''}. Runtime sync performs full upstream verification.`);
