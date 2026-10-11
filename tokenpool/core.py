import secrets, sqlite3, time
from contextlib import contextmanager

class Conflict(Exception): pass
class Invalid(Exception): pass

class Pool:
    def __init__(self, path, clock=time.time):
        self.path, self.clock = path, clock
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, repository TEXT NOT NULL, kind TEXT NOT NULL, instructions TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available');
            CREATE TABLE IF NOT EXISTS claims(task TEXT PRIMARY KEY REFERENCES tasks(id), token TEXT NOT NULL, donor TEXT NOT NULL, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, task TEXT NOT NULL, donor TEXT NOT NULL, outcome TEXT NOT NULL, report TEXT NOT NULL, created REAL NOT NULL);
            ''')
    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()
    def tasks(self):
        with self.connect() as db:
            return [dict(r) for r in db.execute('SELECT t.*, c.donor, c.expires FROM tasks t LEFT JOIN claims c ON t.id=c.task')]
    def register(self, data):
        for key in ('id','repository','kind','instructions'):
            if not isinstance(data.get(key), str) or not data[key].strip(): raise Invalid('Missing '+key)
        if not data['repository'].startswith('https://github.com/'): raise Invalid('GitHub repositories only')
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO tasks(id,repository,kind,instructions) VALUES(?,?,?,?)', tuple(data[k] for k in ('id','repository','kind','instructions')))
            row = dict(db.execute('SELECT * FROM tasks WHERE id=?',(data['id'],)).fetchone())
            if any(row[k] != data[k] for k in ('repository','kind','instructions')): raise Conflict('Task identity already registered with different contents')
            return row
    def operation(self, action, data, donor):
        task = data.get('task')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM tasks WHERE id=?',(task,)).fetchone()
            if not row: raise Invalid('Unknown task')
            claim = db.execute('SELECT * FROM claims WHERE task=?',(task,)).fetchone()
            now = self.clock()
            if action == 'claim':
                if row['status'] != 'available': raise Conflict('Task completed')
                if claim and claim['expires'] > now: raise Conflict('Task already claimed')
                token, expires = secrets.token_urlsafe(32), now+600
                db.execute('INSERT OR REPLACE INTO claims VALUES(?,?,?,?)',(task,token,donor,expires))
                return {'task':task,'token':token,'expires':expires,'instructions':row['instructions']}
            if not claim or claim['expires'] <= now or claim['donor'] != donor or not secrets.compare_digest(claim['token'],str(data.get('token',''))):
                raise Conflict('Invalid or expired claim')
            if action == 'heartbeat':
                expires = now+600
                db.execute('UPDATE claims SET expires=? WHERE task=?',(expires,task))
                return {'task':task,'expires':expires}
            if action not in ('release','complete'): raise Invalid('Unknown operation')
            if not isinstance(data.get('report'),str) or not data['report'].strip(): raise Invalid('A result or handover is required')
            db.execute('INSERT INTO reports(task,donor,outcome,report,created) VALUES(?,?,?,?,?)',(task,donor,action,data['report'],now))
            db.execute('DELETE FROM claims WHERE task=?',(task,))
            # Complete means session complete, not maintainer acceptance.
            return {'task':task,'outcome':action,'status':'available'}
    def reports(self):
        with self.connect() as db: return [dict(r) for r in db.execute('SELECT * FROM reports ORDER BY id')]
