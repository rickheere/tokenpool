ALTER TABLE tasks ADD COLUMN phase TEXT NOT NULL DEFAULT 'preparation';
ALTER TABLE tasks ADD COLUMN proposal TEXT;
ALTER TABLE tasks ADD COLUMN prepared_by TEXT REFERENCES donors(id);
ALTER TABLE tasks ADD COLUMN prepared_at INTEGER;
-- Existing descriptions are not reviewed proposals. Invalidate old leases so they cannot bypass preparation.
UPDATE tasks SET token=NULL, donor=NULL, expires=NULL, request_id=NULL;
ALTER TABLE tasks ADD COLUMN proposal_commit TEXT;
ALTER TABLE tasks ADD COLUMN claim_phase TEXT;
CREATE TRIGGER enforce_claim_phase BEFORE UPDATE OF token ON tasks
WHEN NEW.token IS NOT NULL AND (NEW.claim_phase IS NULL OR NEW.claim_phase != NEW.phase)
BEGIN SELECT RAISE(ABORT, 'Claim must explicitly target the current queue phase'); END;
