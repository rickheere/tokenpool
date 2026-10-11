import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const token=process.env.GITHUB_TOKEN,admin=process.env.TOKENPOOL_ADMIN_TOKEN,url=process.env.TOKENPOOL_URL;
if(!token||!admin||!url?.startsWith('https://'))throw new Error('Set GITHUB_TOKEN, TOKENPOOL_ADMIN_TOKEN and HTTPS TOKENPOOL_URL');
const source=ts.transpileModule(await readFile('src/github.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {validateProject,repositoryName}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const {readdir}=await import('node:fs/promises');
const repositories=[],projects=[],failures=[];
for(const name of await readdir('registry')){
 if(!name.endsWith('.json'))continue;
 const entry=JSON.parse(await readFile('registry/'+name,'utf8')),repository='https://github.com/'+repositoryName(entry.repository);repositories.push(repository);
 try{projects.push(await validateProject(repository,token))}catch(e){failures.push({repository,error:e.message})}
}
const response=await fetch(url+'/v1/admin/projects',{method:'POST',headers:{Authorization:'Bearer '+admin.trim(),'Content-Type':'application/json'},body:JSON.stringify({projects,failures,repositories})});
if(!response.ok)throw new Error(`Coordinator ${response.status}: ${await response.text()}`);
console.log(await response.json());for(const f of failures)console.warn(`${f.repository}: ${f.error}`);
