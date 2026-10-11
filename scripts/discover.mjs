// Discovery proposes register entries; only a merged upstream configuration opts a project in.
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
const token=process.env.GITHUB_TOKEN;
async function api(path){const r=await fetch('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'Tokenpool-discovery',...(token?{Authorization:`Bearer ${token}`}:{})}});if(!r.ok)throw new Error(`GitHub ${r.status}`);return r.json()}
const candidates=new Map();
for(let page=1;page<=10;page++){
 const result=await api(`/search/repositories?q=topic:tokenpool+archived:false+fork:false&per_page=100&page=${page}`);
 for(const repo of result.items)candidates.set(repo.full_name,repo);
 if(result.items.length<100)break;
}
// Code search is an additional discovery route and requires authentication.
if(token){for(let page=1;page<=10;page++){
 const result=await api(`/search/code?q=filename:tokenpool.json+path:.github&per_page=100&page=${page}`);
 for(const item of result.items)if(item.path==='.github/tokenpool.json')candidates.set(item.repository.full_name,item.repository);
 if(result.items.length<100)break;
}}
await mkdir('registry',{recursive:true});let added=0;
for(const [name] of candidates){
 try{
 const meta=await api(`/repos/${name}`);if(meta.fork||meta.private||meta.archived||!meta.license||['other','none'].includes(meta.license.key))continue;
 const configFile=await api(`/repos/${name}/contents/.github/tokenpool.json?ref=${encodeURIComponent(meta.default_branch)}`);
 const config=JSON.parse(Buffer.from(configFile.content,'base64').toString());if(config.version!==1||config.enabled!==true||typeof config.instructions!=='string')continue;
 const filename=`registry/${name.toLowerCase().replace('/','--')}.json`;
 try{await readFile(filename);continue}catch{}
 await writeFile(filename,JSON.stringify({repository:`https://github.com/${name.toLowerCase()}`},null,2)+'\n');added++;
 }catch(e){console.warn(`Skipped ${name}: ${e.message}`)}
}
console.log(`Proposed ${added} new registry entries. Review and submit these changes as a PR.`);
