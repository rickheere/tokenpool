# Deployment

1. Authenticate with `npx wrangler login` on your own machine. Create a database:
   `npx wrangler d1 create tokenpool`. Put the returned database ID into `wrangler.jsonc`.
2. Set `REGISTRY_REPOSITORY` to the GitHub repository containing this register, for example `rickheere/tokenpool`. Keep `ALLOW_DEMO` set to `false`.
3. Apply migrations with `npm run db:remote` and deploy with `npm run deploy`.
4. Configure `ADMIN_TOKEN` through `npx wrangler secret put ADMIN_TOKEN`. It authorizes `POST /v1/admin/sync`; normal donors cannot enroll arbitrary repositories. Set the same secret as `TOKENPOOL_ADMIN_TOKEN` in the register repository’s Actions secrets. The sync workflow uses its own temporary read-only GitHub token; no GitHub token needs to be stored in Cloudflare.
5. Dispatch the `Sync project register` GitHub workflow or wait for its ten-minute schedule. New projects enter through merged register PRs and independently verified upstream participation.
6. Optional browser OAuth login: create a GitHub OAuth App with homepage at your deployment origin and callback at `ORIGIN/auth/callback`. Configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as Worker secrets. No repository scope is requested. Without it, donors can use the CLI identity login and connect the website using their platform credential.
7. Test GET `/v1/config`, `/v1/projects`, and `/v1/tasks`; authenticate and exercise a claim only on a project that opted in.

Cloudflare Workers/D1 plan limits apply. Monitor usage and choose paid limits explicitly as adoption grows. Claims expire by server time and need no cleanup cron. Scheduled sync can fail safely: snapshots older than one hour pause new work rather than trusting an old enrollment indefinitely.

## Operations

- Disable a project upstream with `enabled:false`; the next sync pauses it; new claims also check the participation file directly. Removing its register entry pauses it at the next sync.
- Task `pause` signals human input is needed. An operator can resume it using `UPDATE tasks SET status='available' WHERE id='...'` after reviewing the handover. No automatic retry of blocked tasks.
- Public data includes instructions, task scopes and reports. Tell agents not to place secrets or personal information in reports.
- Credentials are stored as SHA-256 hashes. Website sessions last seven days; CLI credentials last 90 days. Donors can revoke all credentials from account settings.
- The current discovery search is bounded to 1,000 results per search route. Partition searches if the initiative grows beyond that. Runtime sync processes registry entries sequentially; large registers will need batched sync runs.
- HTTPS is required for deployed identity login. For the donation API, use TLS and do not send credentials to an unknown coordinator.

## GitHub automation

CI checks the register structure without external network or credentials on fork PRs. Runtime sync verifies real upstream configuration and license. Discovery runs on the trusted default branch and opens a single rolling PR; it never merges it. GitHub Actions repository settings must permit workflows to create pull requests.
