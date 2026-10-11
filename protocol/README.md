# Protocol v1

The machine-readable HTTP contract is `openapi.json`. JSON requests, JSON responses, bearer platform credentials on mutations. Expiry times are Unix seconds from the server clock.

## Identity

`POST /v1/auth/github-token` verifies a GitHub identity token in the Authorization header and returns a distinct platform credential. GitHub token is not stored. Prefer a minimal identity token; existing broad credentials should only be sent with explicit donor choice and trust in this coordinator. `GET /v1/me` returns preferences. `POST /v1/preferences` sets repositories/topics/minutes/public. Empty selections mean all; populated repository and topic selections are combined with OR.

`POST /v1/credentials` creates a 90-day platform credential. `POST /v1/credentials/revoke` revokes all credentials for the current donor. Browser OAuth is an optional alternative with seven-day sessions.

## Discovery and work

- `GET /v1/projects`: enrolled projects, pinned instructions and participation status.
- `GET /v1/tasks`: inventory, optionally `?repository=URL`. Claims' secrets are never returned.
- `GET /v1/reports`: latest 100 session reports, anonymous unless the donor opts in.
- `POST /v1/tasks`: `{repository, scope, kind, title, source}`. Requires an enabled enrolled project. The stable ID is `github:owner/repo:SCOPE`. Same scope and activity is reusable; conflicting source/activity returns 409.
- `POST /v1/claim`: `{task, request_id}`. Returns `{task, token, expires, instructions, commit_sha}`. Stable `request_id` allows retrying after a lost response while that claim remains active. One live lease per scope; maximum three live leases per donor.
- `POST /v1/heartbeat`: `{task, token}`. Extends lease by 600 seconds. Stop on failure. Project pause prevents renewal after synchronization.
- `POST /v1/release`, `/v1/complete`, `/v1/pause`: `{task, token, report, result_url?}`. Results and lease release are transactional. Identical retries are safe; changed submissions under the same proof conflict. `pause` removes the task from further claiming pending operator review.

`complete` records a finished session, not maintainer acceptance. Tasks remain available for subsequent work until clients determine from the project that work is no longer needed; use pause when repeated work would be inappropriate. No automatic GitHub issue closing or merging.

400 malformed request; 401 missing/invalid identity; 403 cross-origin mutation; 404 unknown resource; 409 unavailable project/task or stale proof; 429 rate limit; 503 missing service configuration. Project validation failures pause new claims. Admin-only `/v1/admin/projects` accepts snapshots validated by the trusted register workflow. No donor can enroll a repository. The public endpoint is limited to 240 mutations per IP per minute.

Reservations only coordinate exact scopes. Broad overlapping work requires a shared decomposition. External GitHub actions cannot be atomic with this coordinator; clients must use stable result references and check ownership immediately before publishing. Claim expiry cannot cancel an external process that ignores the protocol.
