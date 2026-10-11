import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const source=ts.transpileModule(readFileSync('src/github.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {repositoryName,validateProject}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('repository normalization rejects off-GitHub and credential URLs',()=>{
 assert.equal(repositoryName('https://github.com/Owner/Repo'),'owner/repo');
 for(const value of ['https://github.com.evil/owner/repo','https://secret@github.com/owner/repo','owner/repo/issues/1','https://github.com/owner/repo.git'])assert.throws(()=>repositoryName(value));
});
test('upstream config is read at one pinned commit and must opt in',async()=>{
 const original=globalThis.fetch;let enabled=true,fork=false,requests=[];
 globalThis.fetch=async input=>{
  const path=String(input).replace('https://api.github.com','');requests.push(path);
  let value;if(path==='/repos/owner/repo')value={full_name:'Owner/Repo',default_branch:'main',private:false,archived:false,fork,license:{key:'mit'},topics:['testing']};
  else if(path==='/repos/owner/repo/commits/main')value={sha:'pinned'};
  else {const text=path.includes('tokenpool.json')?JSON.stringify({version:1,enabled,instructions:'.github/work.md'}):'Follow CONTRIBUTING.md';value={type:'file',size:text.length,encoding:'base64',content:Buffer.from(text).toString('base64')}}
  return Response.json(value);
 };
 try{const project=await validateProject('owner/repo');assert.equal(project.commit_sha,'pinned');assert.equal(project.instructions,'Follow CONTRIBUTING.md');assert.ok(requests.filter(p=>p.includes('/contents/')).every(p=>p.endsWith('?ref=pinned')));enabled=false;await assert.rejects(validateProject('owner/repo'),/disabled/);enabled=true;fork=true;await assert.rejects(validateProject('owner/repo'),/upstream/)}finally{globalThis.fetch=original}
});
