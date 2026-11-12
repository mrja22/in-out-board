# in-out-board — the clock in / clock out board

A Cloudflare Worker (plain JavaScript, ES modules) at `https://in-out-board.rajev.workers.dev/`, behind Cloudflare Access.
Who's in and who's out, punches, timesheets, PTO / days off, correction requests, Slack clock-in/out and reminders.
Separate from `mrja22/support-ops`: its own Worker, its own D1 database, its own Slack app.

## Where this code came from (read once)

The original source and its git history were lost. On 2026-11-12 this repo was **rebuilt from the bundle Cloudflare was
serving** (deployment of 2026-11-04, "e237be4 added earlier arrival + sign-in is one stay"): the bundle was split back into
its modules along esbuild's `// src/...` markers and the imports/exports put back. Check: `npm run build` produces a bundle
whose every module is line-for-line the live one. Lost in the bundling and not recoverable: comments outside the HTML
pages, any tests, and the three migration files — `migrations/0001_time_clock.sql` is the live schema as of the rebuild,
and 0002 / 0003 are no-ops kept under the names the live database has already recorded as applied.

## Layout

```
src/worker.js        routes: board, /me, /admin, /api/*, /slack/command, /slack/interact; cron entry
src/alerts.js        the 15-minute tick: midnight reset, missed clock-in / clock-out alerts and DMs
src/admin.js         admin API: timesheets, punches, employees, days off, requests, audit, settings, CSV exports
src/requests.js      correction requests (web + Slack), approve / reject
src/timesheet.js     shifts, day summaries and flags, settings validation
src/db.js            D1 reads/writes, audit statements
src/auth.js          Cloudflare Access JWT, admin check (ADMIN_EMAILS)
src/slack-api.js     chat.postMessage / chat.update
src/time.js          America/Denver time helpers
src/*-html.js        the three pages (board, my time, admin) as template strings
```

## Bindings

`DB` (D1 `in-out-board`), `BOARD` (KV, bound but unused by the code), vars `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`,
`ADMIN_EMAILS`; secrets `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` (Cloudflare only, never in git). `DEV_MODE=1` and
`DEV_USER_EMAIL` in `.dev.vars` for local runs (`/__dev/tick?at=` runs the cron).

## Working on it

- Branch, PR, merge to `main`; deploy only from `main` (`npm run deploy`), never from a branch or a dirty tree.
- Before deploying: `npm ci` and `npm run build` (a `wrangler deploy --dry-run`) must pass.
- Schema change = a new numbered file in `migrations/`, applied with `npm run db:migrate`.
