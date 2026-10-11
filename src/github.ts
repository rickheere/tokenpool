export interface Project {
  repository:string; name:string; description:string; topics:string[]; commit_sha:string;
  instructions:string; instructions_path:string; enabled:boolean;
}
export class GitHubError extends Error {
  constructor(message:string, public status=400) { super(message); }
}
export function repositoryName(input:string):string {
  const match=/^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(input);
  if (!match || match[1]==='.' || match[2]==='.' || match[2].endsWith('.git')) throw new GitHubError('Use a GitHub owner/repository URL');
  return `${match[1]}/${match[2]}`.toLowerCase();
}
export async function github(path:string,token?:string) {
  const response=await fetch('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'Tokenpool','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{})}});
  if (!response.ok) throw new GitHubError(`GitHub returned ${response.status}`,response.status);
  return await response.json() as any;
}
async function file(repo:string,path:string,sha:string,token?:string) {
  const item=await github(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`,token);
  if (item.type!=='file' || item.size>65536 || item.encoding!=='base64') throw new GitHubError('Instructions must be a UTF-8 file smaller than 64 KB');
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(Uint8Array.from(atob(item.content.replace(/\s/g,'')),c=>c.charCodeAt(0)));
}
export async function validateProject(input:string,token?:string):Promise<Project> {
  const repo=repositoryName(input), meta=await github(`/repos/${repo}`,token);
  if (meta.private || meta.archived || meta.disabled || meta.fork) throw new GitHubError('Enroll an active public upstream repository');
  if (!meta.license || meta.license.key==='other' || meta.license.key==='none') throw new GitHubError('Repository needs a GitHub-recognized open-source license');
  const commit=await github(`/repos/${repo}/commits/${encodeURIComponent(meta.default_branch)}`,token);
  const config=JSON.parse(await file(repo,'.github/tokenpool.json',commit.sha,token));
  if (config.version!==1 || typeof config.enabled!=='boolean') throw new GitHubError('Configuration needs version: 1 and enabled: true or false');
  if (!config.enabled) throw new GitHubError('Participation is disabled',410);
  if (typeof config.instructions!=='string' || !/^[A-Za-z0-9_./-]+\.md$/.test(config.instructions) || config.instructions.split('/').some((p:string)=>p==='..' || p==='.' || p==='')) throw new GitHubError('instructions must point to a Markdown path in the repository');
  const instructions=await file(repo,config.instructions,commit.sha,token);
  if (!instructions.trim()) throw new GitHubError('Project instructions are empty');
  return {repository:`https://github.com/${meta.full_name.toLowerCase()}`,name:meta.full_name,description:meta.description||'',topics:meta.topics||[],commit_sha:commit.sha,instructions,instructions_path:config.instructions,enabled:true};
}
export async function registryEntries(registry:string,token?:string) {
  const repo=repositoryName(registry);
  const commit=await github(`/repos/${repo}/commits/HEAD`,token);
  const entries=await github(`/repos/${repo}/contents/registry?ref=${commit.sha}`,token);
  const urls:string[]=[];
  for (const entry of entries) {
    if (entry.type!=='file' || !entry.name.endsWith('.json')) continue;
    const value=JSON.parse(await file(repo,`registry/${entry.name}`,commit.sha,token));
    urls.push('https://github.com/'+repositoryName(value.repository));
  }
  return urls;
}
