import json
from pathlib import Path
fields={k:{'type':'string','minLength':1} for k in ['task','token','report','repository','scope','kind','title','source','request_id']}
paths={}
for name in ['config','projects','tasks','reports','me','rankings']:
    paths['/v1/'+name]={'get':{'summary':'Read '+name,'responses':{'200':{'description':'JSON result'}}}}
operations={'tasks':['repository','scope','kind','title','source'],'claim':['task','request_id'],'heartbeat':['task','token'],'release':['task','token','report'],'complete':['task','token','report'],'pause':['task','token','report'],'credentials':[],'credentials/revoke':[],'auth/github-token':[],'session':[],'logout':[],'admin/sync':[]}
for name,required in operations.items():
    props={k:fields[k] for k in required}
    if name in ['release','complete','pause']: props['result_url']={'type':'string','format':'uri'}
    schema={'type':'object','required':required,'properties':props}
    paths.setdefault('/v1/'+name,{})['post']={'security':[{'bearer':[]}],'requestBody':{'required':True,'content':{'application/json':{'schema':schema}}},'responses':{str(c):{'description':d} for c,d in [(200,'Success'),(400,'Invalid request'),(401,'Invalid credential'),(403,'Cross-origin request'),(404,'Unknown resource'),(409,'Conflict or stale proof'),(429,'Rate limited')]}}
schema={'type':'object','required':['repositories','topics','minutes','public'],'properties':{'repositories':{'type':'array','items':{'type':'string'}},'topics':{'type':'array','items':{'type':'string'}},'minutes':{'type':'integer','minimum':1,'maximum':480},'public':{'type':'boolean'}}}
paths['/v1/preferences']={'post':{'security':[{'bearer':[]}],'requestBody':{'required':True,'content':{'application/json':{'schema':schema}}},'responses':{'200':{'description':'Saved preferences'},'400':{'description':'Invalid preferences'}}}}
result={'openapi':'3.1.0','info':{'title':'Tokenpool','version':'1.0.0'},'paths':paths,'components':{'securitySchemes':{'bearer':{'type':'http','scheme':'bearer','description':'Platform credential; auth/github-token instead takes a GitHub identity token'}}}}
Path('protocol/openapi.json').write_text(json.dumps(result,indent=2)+'\n')
