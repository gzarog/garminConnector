# garmin-mcp-server

MCP connector for Garmin Connect — access your health, fitness, and activity data directly in Claude.ai.

## Features

**Health Data** — Daily summaries, heart rate, sleep analysis, stress levels, Body Battery, pulse oximetry, HRV, respiration, and body composition.

**Activities** — List, search, and get detailed breakdowns of activities including laps, splits, HR zones, pace, elevation, and training effect.

**Training** — Push structured workouts and GPS courses to your Garmin device.

## Prerequisites

1. **Garmin Connect Developer Program** — Apply at https://developer.garmin.com/gc-developer-program/overview/
2. **Node.js** ≥ 20
3. **Claude Team or Enterprise plan** (for directory listing)

## Quick Start

```bash
# Install dependencies
npm install

# Copy and fill in your Garmin credentials
cp .env.example .env

# Build
npm run build

# Run with HTTP transport (for Claude.ai)
TRANSPORT=http npm start

# Run with stdio (for MCP Inspector / Claude Desktop)
TRANSPORT=stdio npm start
```

## Testing

```bash
# Run the unit test suite (date validation, response envelope,
# API client retry/pagination, OAuth token refresh)
npm test

# Interactive testing with MCP Inspector
npx @modelcontextprotocol/inspector
```

## Response format

Date-scoped and list tools wrap the Garmin payload in a metadata envelope so
responses are self-describing:

```jsonc
{
  "meta": { "startDate": "2026-06-01", "endDate": "2026-06-07", "days": 7, "count": 3 },
  "data": { /* raw Garmin payload, passed through untouched */ }
}
```

Date ranges are validated (ordering and a maximum span) and list tools
auto-paginate up to the requested `limit`, exposing a `nextOffset` cursor when
more records remain.

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `garmin_get_daily_summary` | Read | Steps, calories, distance, intensity minutes |
| `garmin_get_heart_rate` | Read | Resting HR, HR zones, timestamped samples |
| `garmin_get_sleep` | Read | Sleep stages, scores, SpO2, respiration |
| `garmin_get_stress` | Read | Stress levels and duration breakdown |
| `garmin_get_body_battery` | Read | Energy reserve levels over time |
| `garmin_get_pulse_ox` | Read | Blood oxygen (SpO2) readings |
| `garmin_get_respiration` | Read | Breathing rate data |
| `garmin_get_body_composition` | Read | Weight, BMI, body fat, muscle mass |
| `garmin_get_hrv` | Read | Heart rate variability status |
| `garmin_get_hydration` | Read | Daily hydration intake |
| `garmin_list_activities` | Read | List/filter activities by type and date |
| `garmin_get_activity_detail` | Read | Full activity breakdown with laps/splits |
| `garmin_get_activity_splits` | Read | Per-km/mile splits with pace, HR, elevation |
| `garmin_search_activities` | Read | Search activities by name/criteria |
| `garmin_push_workout` | Write | Send structured workout to device |
| `garmin_push_course` | Write | Send GPS course to device |
| `garmin_get_user_profile` | Read | User profile and preferences |
| `garmin_get_devices` | Read | Connected Garmin devices |

## Documentation

- [Usage guide](./docs/USAGE.md) — connecting to Claude and example prompts
- [Deployment guide](./docs/DEPLOYMENT.md) — Docker, Fly.io, Railway, env vars
- [Architecture](./ARCHITECTURE.md) — full design document
- [Privacy policy](./PRIVACY_POLICY.md)

## Deployment

```bash
# Build and run the container
docker build -t garmin-mcp-server .
docker run --rm -p 3000:3000 --env-file .env garmin-mcp-server
```

See the [deployment guide](./docs/DEPLOYMENT.md) for Fly.io, Railway, secrets,
and the `/healthz` probe.

## Error handling

Failed Garmin calls return actionable messages (a 401 asks you to reconnect, a
429 signals a rate limit). Transient failures (429/5xx/network) are retried with
exponential backoff, honoring the `Retry-After` header. Write payloads are
validated before they reach Garmin.

## License

MIT
