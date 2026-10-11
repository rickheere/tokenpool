import argparse, json, os, sys, time, uuid, subprocess, urllib.request, urllib.error

def main():
    p=argparse.ArgumentParser(description='Thin Tokenpool protocol client')
    p.add_argument('--url',default=os.environ.get('TOKENPOOL_URL','http://127.0.0.1:8787'))
    p.add_argument('command',choices=['login','tasks','projects','reports','me','register','claim','heartbeat','release','complete','pause','keepalive'])
    p.add_argument('--credential-file'); p.add_argument('--use-gh',action='store_true')
    p.add_argument('--minutes',type=int,default=30); p.add_argument('--watch-pid',type=int); p.add_argument('--result-url'); p.add_argument('--task'); p.add_argument('--request-id'); p.add_argument('--claim-file'); p.add_argument('--file'); p.add_argument('--report')
    a=p.parse_args(); data={}
    if a.command=='login':
        if not a.credential_file: p.error('login requires --credential-file')
        if os.path.exists(a.credential_file): p.error('Credential file already exists')
        if not a.url.startswith('https://') and not a.url.startswith('http://127.0.0.1:'): p.error('Login requires HTTPS')
        github_token=subprocess.check_output(['gh','auth','token'],text=True).strip() if a.use_gh else os.environ.get('GITHUB_TOKEN')
        if not github_token: p.error('Set GITHUB_TOKEN or explicitly use --use-gh; identity token is sent to this coordinator once')
        req=urllib.request.Request(a.url+'/v1/auth/github-token',data=b'{}',headers={'User-Agent':'Tokenpool/1.0','Authorization':'Bearer '+github_token,'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=15) as response: result=json.load(response)
        except urllib.error.HTTPError as e:
            print(e.read().decode(),file=sys.stderr); sys.exit(1)
        fd=os.open(a.credential_file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f: json.dump({'url':a.url,'token':result['token']},f)
        print('Signed in as '+result['login']+'; platform credential saved locally.')
        return
    saved={}
    if a.credential_file:
        with open(a.credential_file) as f: saved=json.load(f)
        a.url=saved['url']

    if a.command=='claim' and a.claim_file and os.path.exists(a.claim_file):
        p.error("Claim file already exists; choose a new path")
    if a.command=='register' and not a.file: p.error("register requires --file")
    if a.command=='claim' and not a.task: p.error("claim requires --task")
    if a.command not in ('tasks','projects','reports','me','register','claim') and not a.claim_file: p.error("This command requires --claim-file")
    if a.command in ('release','complete','pause') and not a.report: p.error("This command requires --report")
    if a.command=='register':
        with open(a.file) as f: data=json.load(f)
    elif a.command not in ('tasks','projects','reports','me'):
        if a.command=='claim':
            data={'task':a.task,'request_id':a.request_id or str(uuid.uuid4())}
            print('Claim request ID: '+data['request_id'],file=sys.stderr)
        else:
            with open(a.claim_file) as f: data=json.load(f)
            if a.result_url: data['result_url']=a.result_url
            if a.report:
                with open(a.report) as f: data['report']=f.read()
    def request(command):
        read=command in ('tasks','projects','reports','me')
        req=urllib.request.Request(a.url+'/v1/'+('tasks' if command=='register' else command),data=None if read else json.dumps(data).encode(),headers={'User-Agent':'Tokenpool/1.0','Content-Type':'application/json','Authorization':'Bearer '+saved.get('token',os.environ.get('TOKENPOOL_TOKEN',''))})
        with urllib.request.urlopen(req,timeout=15) as response: return json.load(response)
    try:
        if a.command=='keepalive':
            deadline=time.monotonic()+a.minutes*60
            if a.minutes<1 or a.minutes>480: p.error('--minutes must be 1–480')
            while time.monotonic()<deadline:
                if a.watch_pid:
                    try: os.kill(a.watch_pid,0)
                    except ProcessLookupError: break
                request('heartbeat'); time.sleep(min(120,max(0,deadline-time.monotonic())))
            print('Keepalive stopped; finish the session or let the claim expire.',file=sys.stderr)
            return
        result=request(a.command)
        if a.command=='claim' and a.claim_file:
            fd=os.open(a.claim_file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as f: json.dump(result,f)
            result={k:v for k,v in result.items() if k!='token'}
        print(json.dumps(result,indent=2))
    except urllib.error.HTTPError as e:
        print(e.read().decode(),file=sys.stderr); sys.exit(1)
    except KeyboardInterrupt: pass

if __name__=='__main__': main()
