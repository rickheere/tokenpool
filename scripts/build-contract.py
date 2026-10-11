import json
from pathlib import Path
fields={k:{'type':'string','minLength':1} for k in ['task','token','report','repository','scope','kind','title','source','request_id']}
paths={}
for name in ['config','projects','tasks','reports','me','rankings']:
    paths['/v1/'+name]={'get':{'summary':'Read '+name,'responses':{'200':{'description':'JSON result'}}}}
operations={'tasks':['repository','scope','kind','title','source'],'claim':['task','request_id'],'heartbeat':['task','token'],'release':['task','token','report'],'complete':['task','token','report'],'pause':['task','token','report'],'credentials':[],'credentials/revoke':[],'auth/github-token':[],'session':[],'logout':[],'admin/sync':[],'admin/projects':[]}
for name,required in operations.items():
    props={k:fields[k] for k in required}
    if name in ['release','complete','pause']: props['result_url']={'type':'string','format':'uri'}
    schema={'type':'object','required':required,'properties':props}
    paths.setdefault('/v1/'+name,{})['post']={'security':[{'bearer':[]}],'requestBody':{'required':True,'content':{'application/json':{'schema':schema}}},'responses':{str(c):{'description':d} for c,d in [(200,'Success'),(400,'Invalid request'),(401,'Invalid credential'),(403,'Cross-origin request'),(404,'Unknown resource'),(409,'Conflict or stale proof'),(429,'Rate limited')]}}
schema={'type':'object','required':['repositories','topics','minutes','public'],'properties':{'repositories':{'type':'array','items':{'type':'string'}},'topics':{'type':'array','items':{'type':'string'}},'minutes':{'type':'integer','minimum':1,'maximum':480},'public':{'type':'boolean'}}}
paths['/v1/preferences']={'post':{'security':[{'bearer':[]}],'requestBody':{'required':True,'content':{'application/json':{'schema':schema}}},'responses':{'200':{'description':'Saved preferences'},'400':{'description':'Invalid preferences'}}}}
result={'openapi':'3.1.0','info':{'title':'Tokenpool','version':'1.0.0'},'paths':paths,'components':{'securitySchemes':{'bearer':{'type':'http','scheme':'bearer','description':'Platform credential; auth/github-token instead takes a GitHub identity token'}}}}
schemas={
    'Project':{'type':'object','required':['repository','name','description','topics','commit_sha','instructions','instructions_path','enabled'],'properties':{**{k:{'type':'string'} for k in ['repository','name','description','commit_sha','instructions','instructions_path']},'topics':{'type':'array','items':{'type':'string'}},'enabled':{'type':['integer','boolean']},'checked':{'type':'integer'},'error':{'type':['string','null']}}},
    'Claim':{'type':'object','required':['task','token','expires','instructions','commit_sha'],'properties':{**{k:{'type':'string'} for k in ['task','token','instructions','commit_sha']},'expires':{'type':'integer'}}},
    'Task':{'type':'object','properties':{**{k:{'type':'string'} for k in ['id','repository','kind','title','source','scope','status','instructions','instructions_path','commit_sha']},'donor':{'type':['string','null']},'expires':{'type':['integer','null']},'attempts':{'type':'integer'}}},
    'Report':{'type':'object','properties':{**{k:{'type':'string'} for k in ['id','task','outcome','report','repository','donor']},'result_url':{'type':['string','null']},'created':{'type':'integer'}}}
}
result['components']['schemas']=schemas
for name,shape in [('projects','Project'),('tasks','Task'),('reports','Report')]:
    paths['/v1/'+name]['get']['responses']['200']['content']={'application/json':{'schema':{'type':'array','items':{'$ref':'#/components/schemas/'+shape}}}}
paths['/v1/claim']['post']['responses']['200']['content']={'application/json':{'schema':{'$ref':'#/components/schemas/Claim'}}}
paths['/v1/admin/projects']['post']['requestBody']['content']['application/json']['schema']={'type':'object','required':['projects','repositories','failures'],'properties':{'projects':{'type':'array','items':{'$ref':'#/components/schemas/Project'}},'repositories':{'type':'array','items':{'type':'string'}},'failures':{'type':'array','items':{'type':'object','required':['repository','error'],'properties':{'repository':{'type':'string'},'error':{'type':'string'}}}}}}
Path('protocol/openapi.json').write_text(json.dumps(result,indent=2)+'\n')
