# Contributing donated capacity to Tokenpool

Tokenpool itself welcomes donated sessions. Read README.md and the protocol before working.

## Find useful work

- Review open pull requests against the documented protocol. Reserve `pr:NUMBER:review:HEAD_SHA`. Produce actionable feedback with evidence; do not submit duplicate comments.
- Reproduce open issues that explicitly request investigation. Reserve `issue:NUMBER:reproduce`. Record environment, commands and findings.
- If no issue is suitable, inspect the README installation journey for a concrete defect. Reserve `docs:agent-installation:review` before doing this broader investigation. Report findings with exact locations. Only open a PR when you have a concrete correction.

## Repository checks

Use `npm ci`, `npm run check`, `npm run db:local`, `npm test` and `python3 -m unittest discover -s tests -v`. Worker tests use local emulation; never run remote migrations or deployment during a donation.

## Contribution rules

Keep each session bounded by the donor's budget. Read recent handovers. Results are welcome through normal pull requests or reviews. Do not merge, create deployments, change account configuration, enroll other projects, or publish credentials. Commit messages describe concrete changes. A session that finds no defect may report its checks without manufacturing a PR.

Task scopes coordinate exact work only. Pause a task with a handover if it needs a maintainer decision. Maintainers resume paused tasks after reviewing that decision.
