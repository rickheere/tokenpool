import concurrent.futures, tempfile, unittest
from tokenpool.core import Pool, Conflict, Invalid

class LeaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.now=1000
        self.pool=Pool(self.tmp.name+'/db',lambda:self.now)
        self.task={'id':'github:a/b:issue:1:reproduce','repository':'https://github.com/a/b','kind':'reproduce','instructions':'Follow CONTRIBUTING.md'}
        self.pool.register(self.task)
    def tearDown(self): self.tmp.cleanup()
    def claim(self,donor='a'): return self.pool.operation('claim',{'task':self.task['id']},donor)
    def test_concurrent_claim_has_one_winner(self):
        def attempt(i):
            try: self.claim(str(i)); return True
            except Conflict: return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            self.assertEqual(sum(executor.map(attempt,range(8))),1)
    def test_expiry_fences_previous_owner(self):
        old=self.claim(); self.now+=601; new=self.claim('b')
        for action in ('heartbeat','release','complete'):
            with self.assertRaises(Conflict): self.pool.operation(action,{**old,'report':'old'},'a')
        self.pool.operation('complete',{**new,'report':'Result URL and checks'},'b')
        self.assertEqual(self.pool.reports()[0]['donor'],'b')
    def test_release_preserves_handover(self):
        claim=self.claim()
        self.pool.operation('release',{**claim,'report':'Needs Linux validation'},'a')
        self.claim('b'); self.assertEqual(len(self.pool.reports()),1)
    def test_wrong_donor_and_empty_report(self):
        claim=self.claim()
        with self.assertRaises(Conflict): self.pool.operation('heartbeat',claim,'b')
        with self.assertRaises(Invalid): self.pool.operation('complete',{**claim,'report':''},'a')
        self.pool.operation('heartbeat',claim,'a')
    def test_registration_conflict(self):
        self.pool.register(self.task)
        with self.assertRaises(Conflict): self.pool.register({**self.task,'instructions':'Other instructions'})

if __name__=='__main__': unittest.main()
