# Claude Connectors Directory — Submission Guide

Checklist and reviewer materials for submitting the Garmin connector to the
Claude Connectors Directory. Requirements follow
<https://claude.com/docs/connectors/building/submission>.

## Requirements checklist

| # | Requirement | Where it's satisfied | Status |
|---|-------------|----------------------|--------|
| 1 | Team or Enterprise org (submission portal access) | Account/billing — external | ⬜ |
| 2 | Remote MCP server, Streamable HTTP transport | `src/index.ts` (`/mcp`) | ✅ |
| 3 | OAuth 2.0 authentication | `src/services/auth.ts`, `/authorize` + `/oauth/callback` | ✅ |
| 4 | Tool annotations (`title`, `readOnlyHint`, `destructiveHint`) | `src/tools/*` (all 19 tools) | ✅ |
| 5 | Public privacy policy | [`PRIVACY_POLICY.md`](../PRIVACY_POLICY.md) | ✅ |
| 6 | Public setup/usage documentation | [`docs/USAGE.md`](./USAGE.md), [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) | ✅ |
| 7 | Populated test account + reviewer instructions | This document (below) | ⬜ (data) |
| 8 | Branding: logo (SVG), favicon, screenshots | [`assets/`](../assets) | ✅ logo/favicon · ⬜ screenshots |

Remaining items (1, 7, screenshots) are operational — they require a paid Claude
plan, a real Garmin account with data, and captured screenshots. Everything the
codebase can provide is in place.

## Pre-submission steps

1. **Deploy** the server with `TRANSPORT=http` and a public HTTPS URL (see
   [DEPLOYMENT.md](./DEPLOYMENT.md)). Confirm `GET /healthz` returns `ok: true`.
2. **Register redirect URI** `${PUBLIC_BASE_URL}/oauth/callback` in the Garmin
   developer app, and set `GARMIN_CLIENT_ID` / `GARMIN_CLIENT_SECRET` /
   `GARMIN_SCOPES`.
3. **Verify branding** is reachable: `GET /logo.svg` and `GET /favicon.svg`.
4. **Connect** the server in Claude.ai and smoke-test one tool from each group
   (health, activity, training, user).
5. **Capture screenshots** listed in [`assets/README.md`](../assets/README.md).

## Test account & reviewer instructions

Provide the reviewer with a Garmin account that has recent, populated data.

> **Reviewer steps**
>
> 1. In Claude.ai, add the connector at `https://<deployed-host>/mcp` and click
>    **Connect**. You'll be redirected to Garmin Connect to authorize, then back
>    to Claude.
> 2. **Health:** ask *"Summarize my sleep for the last 3 nights."* → calls
>    `garmin_get_sleep` and returns stages/score for the test account.
> 3. **Activity:** ask *"List my activities from last week."* → calls
>    `garmin_list_activities`; then *"Show splits for the most recent run."*
> 4. **Profile:** ask *"What Garmin devices are on my account?"* → calls
>    `garmin_get_devices`.
> 5. **Write (optional):** ask *"Create a 4×800m interval workout and push it to
>    my watch."* → calls `garmin_push_workout`; confirm it appears on the device.
>
> Expected: read tools return the test account's data wrapped in a `meta`/`data`
> envelope; write tools create content on the connected device. A 401 means the
> Garmin connection needs to be re-authorized.

### Test account data to populate

- At least 7 days of daily summaries, heart rate, sleep, and stress.
- 3–5 recent activities of mixed types (e.g. run, ride, walk).
- A connected device visible under devices.

## Submission

Submit via <https://clau.de/mcp-directory-submission> with:

- Server URL: `https://<deployed-host>/mcp`
- Privacy policy URL and documentation URL (public)
- Logo and screenshots from `assets/`
- The reviewer instructions above and test-account credentials

Review is queue-based with no fixed SLA; address any feedback and resubmit.
