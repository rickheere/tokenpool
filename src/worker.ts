import {github, GitHubError, registryEntries, repositoryName, validateProject, type Project} from './github';
interface Env {DB:D1Database; ASSETS:Fetcher; GITHUB_CLIENT_ID?:string; GITHUB_CLIENT_SECRET?:string; GITHUB_TOKEN?:string; ADMIN_TOKEN?:string; REGISTRY_REPOSITORY:string; ALLOW_DEMO:string;}
class APIError extends Error {constructor(public status:number,message:string){super(message)}}
const now=()=>Math.floor(Date.now()/1000);
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const random=()=>crypto.randomUUID()+crypto.randomUUID();
async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('')}
function str(body:any,key:string,max=1000):string {if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>max)throw new APIError(400,`Invalid ${key}`);return body[key].trim()}
function cookie(request:Request,name:string){return request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)}
async function donor(request:Request,env:Env){
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||cookie(request,'tp_session');
 if(!token)throw new APIError(401,'Sign in or supply a donor credential');
 const user=await env.DB.prepare('SELECT d.* FROM donors d JOIN credentials c ON c.donor=d.id WHERE c.hash=? AND c.expires>?').bind(await hash(token),now()).first<any>();
 if(!user)throw new APIError(401,'Credential expired or invalid');return user;
}
async function credential(env:Env,id:string,days:number){const token=random();await env.DB.prepare('INSERT INTO credentials VALUES(?,?,?)').bind(await hash(token),id,now()+days*86400).run();return token}
async function saveProject(env:Env,p:Project){await env.DB.prepare(`INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(repository) DO UPDATE SET name=excluded.name,description=excluded.description,topics=excluded.topics,commit_sha=excluded.commit_sha,instructions=excluded.instructions,instructions_path=excluded.instructions_path,enabled=1,checked=excluded.checked,error=NULL`).bind(p.repository,p.name,p.description,JSON.stringify(p.topics),p.commit_sha,p.instructions,p.instructions_path,1,now()).run()}
async function sync(env:Env){
 if(!env.REGISTRY_REPOSITORY)throw new APIError(503,'Set REGISTRY_REPOSITORY before syncing');
 const repos=await registryEntries(env.REGISTRY_REPOSITORY,env.GITHUB_TOKEN),result=[];
 const known=await env.DB.prepare('SELECT repository FROM projects').all<{repository:string}>();
 for(const p of known.results)if(!repos.includes(p.repository))await env.DB.prepare('UPDATE projects SET enabled=0,error=? WHERE repository=?').bind('Removed from registry',p.repository).run();
 for(const repo of repos){try{await saveProject(env,await validateProject(repo,env.GITHUB_TOKEN));result.push({repository:repo,enabled:true})}catch(e){const message=e instanceof Error?e.message:'Validation failed';await env.DB.prepare('UPDATE projects SET enabled=0,checked=?,error=? WHERE repository=?').bind(now(),message,repo).run();result.push({repository:repo,enabled:false,error:message})}}
 return result;
}
async function projectReady(env:Env,repository:string){
 let p=await env.DB.prepare('SELECT * FROM projects WHERE repository=?').bind(repository).first<any>();
 if(!p||!p.enabled)throw new APIError(409,'Project is not enrolled or has paused participation');
 if(p.checked<now()-900 && !(env.ALLOW_DEMO==='true'&&repository.includes('/tokenpool-demo/'))){
  try{await saveProject(env,await validateProject(repository,env.GITHUB_TOKEN))}catch(e){await env.DB.prepare('UPDATE projects SET enabled=0,error=?,checked=? WHERE repository=?').bind(e instanceof Error?e.message:'Validation failed',now(),repository).run();throw new APIError(409,'Project configuration could not be verified; new work is paused')}
  p=await env.DB.prepare('SELECT * FROM projects WHERE repository=?').bind(repository).first<any>();
 }return p;
}
async function route(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),path=url.pathname;
 if(request.method==='GET'&&path==='/auth/github'){
  if(!env.GITHUB_CLIENT_ID)throw new APIError(503,'GitHub login is not configured yet');
  const state=random();await env.DB.prepare('INSERT INTO oauth_states VALUES(?,?)').bind(await hash(state),now()+600).run();
  const target=new URL('https://github.com/login/oauth/authorize');target.searchParams.set('client_id',env.GITHUB_CLIENT_ID);target.searchParams.set('state',state);target.searchParams.set('redirect_uri',url.origin+'/auth/callback');
  return new Response(null,{status:302,headers:{Location:target.href,'Set-Cookie':`tp_state=${state}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600${url.protocol==='https:'?'; Secure':''}`}});
 }
 if(request.method==='GET'&&path==='/auth/callback'){
  const state=url.searchParams.get('state'),code=url.searchParams.get('code');
  if(!state||state!==cookie(request,'tp_state')||!code)throw new APIError(400,'Invalid login state');
  const deleted=await env.DB.prepare('DELETE FROM oauth_states WHERE hash=? AND expires>? RETURNING hash').bind(await hash(state),now()).first();if(!deleted)throw new APIError(400,'Login expired; start again');
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:url.origin+'/auth/callback'})});
  const auth=await response.json() as any;if(!auth.access_token)throw new APIError(401,'GitHub did not authorize login');
  const user=await github('/user',auth.access_token); // GitHub credential is discarded; only platform credentials persist.
  await env.DB.prepare('INSERT INTO donors(id,login,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login').bind(String(user.id),user.login,now()).run();
  const token=await credential(env,String(user.id),7);
  const headers=new Headers({Location:'/', 'Cache-Control':'no-store'});headers.append('Set-Cookie',`tp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${url.protocol==='https:'?'; Secure':''}`);headers.append('Set-Cookie','tp_state=; HttpOnly; Path=/auth; Max-Age=0');return new Response(null,{status:302,headers});
 }
 if(request.method==='GET'){
  if(path==='/v1/config')return json({registry:env.REGISTRY_REPOSITORY,login:!!env.GITHUB_CLIENT_ID,demo:env.ALLOW_DEMO==='true'});
  if(path==='/v1/projects'){const rows=await env.DB.prepare('SELECT * FROM projects ORDER BY name').all<any>();return json(rows.results.map(p=>({...p,topics:JSON.parse(p.topics)})))}
  if(path==='/v1/tasks'){
   const repository=url.searchParams.get('repository'),rows=await env.DB.prepare(`SELECT t.id,t.repository,t.kind,t.title,t.source,t.scope,t.status,t.donor,t.expires,t.attempts,p.commit_sha,p.instructions,p.instructions_path FROM tasks t JOIN projects p ON p.repository=t.repository WHERE p.enabled=1 ${repository?'AND t.repository=?':''} ORDER BY t.attempts,t.created`).bind(...(repository?[repository]:[])).all();return json(rows.results);
  }
  if(path==='/v1/reports'){const rows=await env.DB.prepare(`SELECT r.id,r.task,r.outcome,r.report,r.result_url,r.created,t.repository,CASE WHEN json_extract(d.preferences,'$.public')=1 THEN d.login ELSE 'Anonymous donor' END AS donor FROM reports r JOIN donors d ON d.id=r.donor JOIN tasks t ON t.id=r.task ORDER BY r.created DESC LIMIT 100`).all();return json(rows.results)}
  if(path==='/v1/me'){const user=await donor(request,env);return json({id:user.id,login:user.login,preferences:JSON.parse(user.preferences)})}
  if(path==='/v1/rankings'){const rows=await env.DB.prepare(`SELECT d.login,COUNT(*) AS contributions FROM reports r JOIN donors d ON r.donor=d.id WHERE json_extract(d.preferences,'$.public')=1 AND r.outcome='complete' GROUP BY d.id ORDER BY contributions DESC LIMIT 20`).all();return json(rows.results)}
  return env.ASSETS.fetch(request);
 }
 if(request.method!=='POST')throw new APIError(405,'Use GET or POST');
 const bucket=await hash((request.headers.get('CF-Connecting-IP')||'local')+':'+Math.floor(now()/60));
 const rate=await env.DB.prepare('INSERT INTO request_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,now()+120).first<{count:number}>();
 if(rate&&rate.count>240)throw new APIError(429,'Too many requests; retry next minute');
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)throw new APIError(403,'Cross-origin writes are not allowed');
 if(Number(request.headers.get('Content-Length')||0)>65536)throw new APIError(413,'Request too large');
 const raw=await request.text();if(raw.length>65536)throw new APIError(413,'Request too large');
 let body:any;try{body=JSON.parse(raw||'{}')}catch{throw new APIError(400,'Expected JSON')};if(!body||typeof body!=='object'||Array.isArray(body))throw new APIError(400,'Expected JSON object');
 if(path==='/v1/admin/sync'){
  if(!env.ADMIN_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.ADMIN_TOKEN}`)throw new APIError(401,'Admin credential required');return json(await sync(env));
 }
 if(path==='/v1/demo/login'){
  if(env.ALLOW_DEMO!=='true')throw new APIError(404,'Not found');
  await env.DB.prepare('INSERT OR IGNORE INTO donors(id,login,created) VALUES(?,?,?)').bind('demo','demo-donor',now()).run();
  const token=await credential(env,'demo',1);return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':`tp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,'Cache-Control':'no-store'}});
 }
 if(path==='/v1/auth/github-token'){
  const githubToken=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!githubToken)throw new APIError(401,'Supply a GitHub identity token');
  let identity:any;try{identity=await github('/user',githubToken)}catch{throw new APIError(401,'GitHub could not verify this identity token')}
  await env.DB.prepare('INSERT INTO donors(id,login,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login').bind(String(identity.id),identity.login,now()).run();
  const token=await credential(env,String(identity.id),90);return json({token,expires:now()+90*86400,login:identity.login});
 }
 const user=await donor(request,env);
 if(path==='/v1/session'){
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!token)throw new APIError(401,'Supply a platform credential');
  return new Response('{}',{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`tp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${url.protocol==='https:'?'; Secure':''}`}});
 }
 if(path==='/v1/logout'){
  const token=cookie(request,'tp_session');if(token)await env.DB.prepare('DELETE FROM credentials WHERE hash=?').bind(await hash(token)).run();return new Response('{}',{headers:{'Content-Type':'application/json','Set-Cookie':'tp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}});
 }
 if(path==='/v1/preferences'){
  const repositories=body.repositories||[],topics=body.topics||[];
  if(!Array.isArray(repositories)||repositories.length>100||!repositories.every((r:any)=>typeof r==='string')||!Array.isArray(topics)||topics.length>30||!topics.every((t:any)=>typeof t==='string'&&t.length<80))throw new APIError(400,'Invalid project or topic selection');
  if(!Number.isInteger(body.minutes)||body.minutes<1||body.minutes>480||typeof body.public!=='boolean')throw new APIError(400,'Choose 1–480 minutes and a public-profile preference');
  const preferences={repositories:repositories.map(r=>'https://github.com/'+repositoryName(r)),topics,minutes:body.minutes,public:body.public};await env.DB.prepare('UPDATE donors SET preferences=? WHERE id=?').bind(JSON.stringify(preferences),user.id).run();return json(preferences);
 }
 if(path==='/v1/credentials'){const token=await credential(env,user.id,90);return json({token,expires:now()+90*86400})}
 if(path==='/v1/credentials/revoke'){await env.DB.prepare('DELETE FROM credentials WHERE donor=?').bind(user.id).run();return json({ok:true})}
 if(path==='/v1/tasks'){
  const repository='https://github.com/'+repositoryName(str(body,'repository'));
  await projectReady(env,repository);
  const scope=str(body,'scope',300),kind=str(body,'kind',80),title=str(body,'title',300),source=str(body,'source',1000);
  if(!source.startsWith(repository+'/')&&source!==repository)throw new APIError(400,'Source must belong to the enrolled repository');
  const id='github:'+repositoryName(repository)+':'+scope;
  await env.DB.prepare('INSERT OR IGNORE INTO tasks(id,repository,kind,title,source,scope,created) VALUES(?,?,?,?,?,?,?)').bind(id,repository,kind,title,source,scope,now()).run();
  const task=await env.DB.prepare('SELECT id,repository,kind,title,source,scope,status FROM tasks WHERE id=?').bind(id).first<any>();
  if(task.kind!==kind||task.source!==source)throw new APIError(409,'Scope is already registered with a different source or activity');return json(task);
 }
 if(['/v1/claim','/v1/heartbeat','/v1/release','/v1/complete','/v1/pause'].includes(path)){
  const taskId=str(body,'task'),task=await env.DB.prepare('SELECT * FROM tasks WHERE id=?').bind(taskId).first<any>();if(!task)throw new APIError(404,'Unknown task');
  if(path==='/v1/claim'){
   const project=await projectReady(env,task.repository),requestId=str(body,'request_id',100);
   const token=random(),expires=now()+600;
   const claimed=await env.DB.prepare(`UPDATE tasks SET token=?,donor=?,expires=?,request_id=?,instructions_snapshot=?,commit_snapshot=?,attempts=attempts+1 WHERE id=? AND status='available' AND (expires IS NULL OR expires<=?) AND (SELECT COUNT(*) FROM tasks WHERE donor=? AND expires>?)<3 RETURNING id`).bind(token,user.id,expires,requestId,project.instructions,project.commit_sha,taskId,now(),user.id,now()).first();
   if(!claimed){const current=await env.DB.prepare('SELECT * FROM tasks WHERE id=?').bind(taskId).first<any>();if(current.request_id===requestId&&current.donor===user.id&&current.expires>now())return json({task:taskId,token:current.token,expires:current.expires,instructions:current.instructions_snapshot,commit_sha:current.commit_snapshot});throw new APIError(409,'Task is already claimed or paused')}
   return json({task:taskId,token,expires,instructions:project.instructions,commit_sha:project.commit_sha});
  }
  const token=str(body,'token',200);
  if(path==='/v1/heartbeat'){
   const p=await env.DB.prepare('SELECT enabled FROM projects WHERE repository=?').bind(task.repository).first<any>();if(!p?.enabled)throw new APIError(409,'Project paused; stop this session');
   const expires=now()+600,renewed=await env.DB.prepare('UPDATE tasks SET expires=? WHERE id=? AND token=? AND donor=? AND expires>? RETURNING id').bind(expires,taskId,token,user.id,now()).first();if(!renewed)throw new APIError(409,'Claim expired or invalid');return json({task:taskId,expires});
  }
  const outcome=path.slice(4),report=str(body,'report',30000),claimHash=await hash(token);
  const prior=await env.DB.prepare('SELECT * FROM reports WHERE claim_hash=? AND donor=? AND task=?').bind(claimHash,user.id,taskId).first<any>();
  if(prior){if(prior.outcome!==outcome||prior.report!==report||(prior.result_url||null)!==(body.result_url||null))throw new APIError(409,'Claim already submitted with different contents');return json({task:taskId,outcome,id:prior.id})}
  let resultUrl:string|null=body.result_url||null;if(resultUrl){let u:URL;try{u=new URL(resultUrl)}catch{throw new APIError(400,'Invalid result URL')}if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password)throw new APIError(400,'Result URL must use HTTPS on GitHub')}
  // The insert and release share a D1 transaction; a stale claim cannot submit between them.
  const id=crypto.randomUUID();const results=await env.DB.batch([
   env.DB.prepare(`INSERT INTO reports(id,task,donor,outcome,report,result_url,created,claim_hash) SELECT ?,id,?,?,?,?,?,? FROM tasks WHERE id=? AND token=? AND donor=? AND expires>?`).bind(id,user.id,outcome,report,resultUrl,now(),claimHash,taskId,token,user.id,now()),
   env.DB.prepare(`UPDATE tasks SET token=NULL,donor=NULL,expires=NULL,request_id=NULL,status=? WHERE id=? AND token=? AND donor=? AND EXISTS(SELECT 1 FROM reports WHERE id=?)`).bind(outcome==='pause'?'paused':'available',taskId,token,user.id,id)
  ]);if(!results[0].meta.changes)throw new APIError(409,'Claim expired or invalid');return json({task:taskId,outcome,id});
 }
 throw new APIError(404,'Not found');
}
export default {
 async fetch(request:Request,env:Env){try{return await route(request,env)}catch(e){if(e instanceof APIError)return json({error:e.message},e.status);if(e instanceof GitHubError)return json({error:e.message},502);console.error(e instanceof Error?e.message:'Request failed');return json({error:'Request failed; retry or contact the operator'},500)}},
 async scheduled(_event:ScheduledEvent,env:Env,ctx:ExecutionContext){ctx.waitUntil(sync(env).then(async()=>{await env.DB.batch([env.DB.prepare('DELETE FROM credentials WHERE expires<?').bind(now()),env.DB.prepare('DELETE FROM oauth_states WHERE expires<?').bind(now()),env.DB.prepare('DELETE FROM request_limits WHERE expires<?').bind(now())])}))}
};
