# Usage Guide

This guide covers connecting the Garmin MCP server to Claude and example
prompts for each tool group.

## Connecting

### Claude.ai (remote connector)

1. Deploy the server with `TRANSPORT=http` (see [DEPLOYMENT.md](./DEPLOYMENT.md)).
2. In Claude.ai, add a custom connector pointing at `https://your-domain/mcp`.
3. Click **Connect** and complete the Garmin OAuth flow — you'll be redirected
   to Garmin Connect to grant access, then back to Claude.

See the [connect guide](./CONNECT.md) for a step-by-step walkthrough, including
a **demo mode** that lets you test the full Connect flow with sample data and no
Garmin developer account.

### MCP Inspector / Claude Desktop (local)

```bash
npm run build
TRANSPORT=stdio node dist/index.js
# or, interactively:
npx @modelcontextprotocol/inspector node dist/index.js
```

## Response shape

Date-scoped and list tools return a metadata envelope; the untouched Garmin
payload is under `data`:

```jsonc
{
  "meta": { "startDate": "2026-06-01", "endDate": "2026-06-07", "days": 7, "count": 3 },
  "data": { /* raw Garmin payload */ }
}
```

- Date ranges are validated (ordering; wellness queries are capped at 31 days).
- List tools auto-paginate up to `limit` and return a `nextOffset` cursor when
  more records remain.
- Errors come back with an actionable message (e.g. a 401 asks you to reconnect
  Garmin; a 429 indicates a rate limit).

## Example prompts

### Health

- "What was my resting heart rate last week?" → `garmin_get_heart_rate`
- "Summarize my sleep for the last 5 nights, including SpO2." → `garmin_get_sleep`
- "How did my Body Battery trend yesterday?" → `garmin_get_body_battery`
- "Show my stress levels for 2026-06-28." → `garmin_get_stress`
- "What's my HRV status this week?" → `garmin_get_hrv`
- "Chart my weight and body fat this month." → `garmin_get_body_composition`

### Activities

- "List my runs in June 2026." → `garmin_list_activities`
- "Give me the full breakdown of activity 123456, with laps and HR zones."
  → `garmin_get_activity_detail`
- "Show per-km splits for my last long run." → `garmin_get_activity_splits`
- "Find activities named 'tempo'." → `garmin_search_activities`

### Training (write)

- "Build a 4×800m interval workout and send it to my watch."
  → `garmin_push_workout`
- "Push this weekend's route as a course to my device." → `garmin_push_course`
- "Create a 3-day training plan starting Monday." → `garmin_push_training_plan`

Write tools validate the payload before sending (a timed step must have a
duration; a course needs at least two distinct points).

### Profile

- "What Garmin devices are on my account?" → `garmin_get_devices`
- "What are my unit preferences?" → `garmin_get_user_profile`

## Tool safety annotations

Every tool declares `readOnlyHint` / `destructiveHint` so the client can label
read vs. write actions. The three `garmin_push_*` tools are the only writes and
create new content on the device (non-destructive).
