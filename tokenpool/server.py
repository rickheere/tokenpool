import argparse, json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from .core import Pool, Conflict, Invalid

def serve(pool, identities, port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def respond(self, status, value):
            body=json.dumps(value).encode()
            self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        def do_GET(self):
            if self.path=='/v1/tasks': self.respond(200,pool.tasks())
            elif self.path=='/v1/reports': self.respond(200,pool.reports())
            else: self.respond(404,{'error':'Not found'})
        def do_POST(self):
            donor=identities.get(self.headers.get('Authorization','').removeprefix('Bearer '))
            if not donor: return self.respond(401,{'error':'Invalid credential'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if size > 65536: raise Invalid('Request too large')
                data=json.loads(self.rfile.read(size))
                if not isinstance(data,dict): raise Invalid('Object required')
                if self.path not in ('/v1/tasks','/v1/claim','/v1/heartbeat','/v1/release','/v1/complete'):
                    return self.respond(404,{'error':'Not found'})
                action=self.path.removeprefix('/v1/')
                result=pool.register(data) if action=='tasks' else pool.operation(action,data,donor)
                self.respond(200,result)
            except Conflict as e: self.respond(409,{'error':str(e)})
            except (Invalid,ValueError,TypeError) as e: self.respond(400,{'error':str(e)})
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    print(f'Tokenpool listening at http://127.0.0.1:{server.server_port}',flush=True)
    server.serve_forever()

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--database',default='tokenpool.db'); parser.add_argument('--port',type=int,default=8787); args=parser.parse_args()
    token=os.environ.get('TOKENPOOL_TOKEN')
    if not token: parser.error('Set TOKENPOOL_TOKEN for this local prototype')
    serve(Pool(args.database),{token:'local-donor'},args.port)
