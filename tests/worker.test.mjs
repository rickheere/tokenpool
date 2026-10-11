import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
let port,base,server,cookie,token;const state=mkdtempSync(join(tmpdir(),'tokenpool-test-'));
function sql(statement){const result=spawnSync('node',['node_modules/wrangler/bin/wrangler.js','d1','execute','tokenpool','--local','--persist-to',state,'--command',statement],{encoding:'utf8'});assert.equal(result.status,0,result.stderr)}
async function api(path,body,credential=token){const response=await fetch(base+path,{headers:{...(cookie?{Cookie:cookie}:{}),...(credential?{Authorization:'Bearer '+credential}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});return {status:response.status,value:await response.json(),response}}
before(async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));port=socket.address().port;await new Promise(r=>socket.close(r));base=`http://127.0.0.1:${port}`;
 const migration=spawnSync('node',['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','tokenpool','--local','--persist-to',state],{encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
 sql("INSERT OR REPLACE INTO projects VALUES('https://github.com/tokenpool-demo/test','tokenpool-demo/test','Test fixture','[\"testing\"]','abc','Test instructions','.github/tokenpool.md',1,2147483647,NULL)");
 server=spawn('node',['node_modules/wrangler/bin/wrangler.js','dev','--port',String(port),'--persist-to',state,'--var','ALLOW_DEMO:true','--var','ADMIN_TOKEN:test-admin'],{stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 for(let i=0;i<200;i++){try{const r=await fetch(base+'/v1/config');if(r.ok&&r.headers.get('content-type')?.includes('application/json'))break}catch{}await new Promise(r=>setTimeout(r,100));if(i===199)throw new Error(logs)}
 const login=await api('/v1/demo/login',{},null);assert.equal(login.status,200);cookie=login.response.headers.get('set-cookie').split(';')[0];
 token=(await api('/v1/credentials',{},null)).value.token;
});
after(async()=>{if(server&&!server.killed){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r))}rmSync(state,{recursive:true,force:true})});
test('preferences persist and privacy is opt-in',async()=>{
 const me=await api('/v1/me');assert.equal(me.value.preferences.public,false);
 const saved=await api('/v1/preferences',{repositories:['https://github.com/tokenpool-demo/test'],topics:['testing'],minutes:20,public:false});assert.equal(saved.status,200);assert.equal((await api('/v1/me')).value.preferences.minutes,20);
});
test('unenrolled repositories cannot register work',async()=>{assert.equal((await api('/v1/tasks',{repository:'https://github.com/unknown/project',scope:'issue:1',kind:'review',title:'Review',source:'https://github.com/unknown/project/issues/1'})).status,409)});
test('one winner, retry safety, handover and expired owner fencing',async()=>{
 const scope='issue:'+Date.now()+':reproduce';
 const registered=await api('/v1/tasks',{repository:'https://github.com/tokenpool-demo/test',scope,kind:'reproduce',title:'Reproduce test bug',source:'https://github.com/tokenpool-demo/test/issues/1'});assert.equal(registered.status,200);const task=registered.value.id;
 const outcomes=await Promise.all(Array.from({length:8},(_,i)=>api('/v1/claim',{task,request_id:'parallel-'+i})));assert.equal(outcomes.filter(r=>r.status===200).length,1);const index=outcomes.findIndex(r=>r.status===200),claim=outcomes[index].value;
 assert.equal((await api('/v1/tasks')).value.find(t=>t.id===task).donor,null);
 const retry=await api('/v1/claim',{task,request_id:'parallel-'+index});assert.equal(retry.value.token,claim.token);
 assert.equal((await api('/v1/heartbeat',claim)).status,200);
 const report={...claim,report:'Reproduced in a test fixture. No external writes.'};assert.equal((await api('/v1/release',report)).status,200);assert.equal((await api('/v1/release',report)).status,200);
 assert.equal((await api('/v1/release',{...report,report:'different'})).status,409);
 const next=(await api('/v1/claim',{task,request_id:'next'})).value;assert.equal((await api('/v1/heartbeat',claim)).status,409);
 sql(`UPDATE tasks SET expires=0 WHERE id='${task}'`);
 const last=(await api('/v1/claim',{task,request_id:'last'})).value;
 assert.equal((await api('/v1/complete',{...next,report:'stale'})).status,409);
 assert.equal((await api('/v1/complete',{...last,report:'Done'})).status,200);
 const reports=(await api('/v1/reports')).value.filter(r=>r.task===task);assert.equal(reports.length,2);assert.ok(reports.every(r=>r.donor==='Anonymous donor'));assert.equal((await api('/v1/rankings')).value.length,0);
});
test('cross-origin mutations rejected',async()=>{const r=await fetch(base+'/v1/credentials',{method:'POST',headers:{Origin:'https://evil.example',Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403)});
test('public listing never leaks claim secrets',async()=>{const tasks=(await api('/v1/tasks')).value;assert.ok(tasks.every(t=>!('token'in t)&&!('request_id'in t)));assert.equal((await api('/v1/me',undefined,'bad')).status,401)});

test('only an administrator can synchronize upstream snapshots',async()=>{
 const repository='https://github.com/tokenpool-demo/snapshot';
 const body={repositories:[repository],failures:[],projects:[{repository,name:'tokenpool-demo/snapshot',description:'Snapshot fixture',topics:['testing'],commit_sha:'a'.repeat(40),instructions:'Fixture instructions',instructions_path:'.github/tokenpool.md',enabled:true}]};
 assert.equal((await api('/v1/admin/projects',body)).status,401);
 const accepted=await api('/v1/admin/projects',body,'test-admin');assert.equal(accepted.status,200,JSON.stringify(accepted.value));assert.equal(accepted.value.updated,1);
 const project=(await api('/v1/projects')).value.find(p=>p.repository===repository);assert.equal(project.instructions,'Fixture instructions');
 assert.equal((await api('/v1/admin/projects',{...body,failures:[{repository,error:'Disabled upstream'}],projects:[]},'test-admin')).status,200);
 const blocked=await api('/v1/tasks',{repository,scope:'test',kind:'review',title:'Review',source:repository});assert.equal(blocked.status,409);
});
