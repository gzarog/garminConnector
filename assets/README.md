# Branding assets

Assets for the Claude Connectors Directory listing and MCP Apps.

| File | Purpose | Status |
|------|---------|--------|
| `logo.svg` | Primary square logo (512×512), used in the directory listing | ✅ Provided |
| `favicon.svg` | Favicon (64×64) served at `/favicon.svg` | ✅ Provided |
| `screenshots/` | Product screenshots for the listing | ⬜ To capture |

The running HTTP server exposes the logo and favicon:

- `GET /logo.svg`
- `GET /favicon.svg`

## Screenshots to capture

Directory listings expect a few screenshots showing the connector in use. Capture
these from Claude.ai once the connector is connected to a populated test account
(see [`docs/SUBMISSION.md`](../docs/SUBMISSION.md)):

1. Connecting the Garmin connector (OAuth consent → connected state).
2. A health query, e.g. a sleep or heart-rate summary rendered by Claude.
3. An activity breakdown (laps / splits) from `garmin_get_activity_detail`.
4. A structured workout being pushed with `garmin_push_workout`.

Save them as `screenshots/01-connect.png`, `02-health.png`, `03-activity.png`,
`04-workout.png` (PNG, ≥ 1280px wide).

## Colors

- Primary gradient: `#0b3d91` → `#1e88e5`
- Foreground: `#ffffff`
