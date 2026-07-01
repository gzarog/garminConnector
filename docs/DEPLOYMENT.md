# Deployment

The server runs as a stateless Node process exposing the MCP Streamable HTTP
endpoint at `/mcp` plus OAuth routes. Any container host works; a Docker image
and a Fly.io example are provided.

## Environment variables

See [`.env.example`](../.env.example) for the full list. The essential ones:

| Variable | Required | Notes |
|----------|----------|-------|
| `TRANSPORT` | yes | `http` for remote connector; `stdio` for local tools |
| `PORT` / `HOST` | no | HTTP bind (default `3000` / `0.0.0.0`) |
| `PUBLIC_BASE_URL` | yes (http) | Public URL; used to build the OAuth redirect URI |
| `GARMIN_CLIENT_ID` | yes | From the Garmin Connect Developer Program |
| `GARMIN_CLIENT_SECRET` | yes | Keep secret — set via your host's secret manager |
| `GARMIN_SCOPES` | no | Space-separated OAuth scopes |
| `TOKEN_STORE` | no | `memory` (default) or `redis` |
| `REDIS_URL` | if redis | Connection string for the Redis token store |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error` |

> Register `${PUBLIC_BASE_URL}/oauth/callback` as an allowed redirect URI in your
> Garmin developer app.

## Docker

```bash
# Build
docker build -t garmin-mcp-server .

# Run (pass secrets via env or --env-file)
docker run --rm -p 3000:3000 \
  -e TRANSPORT=http \
  -e PUBLIC_BASE_URL=https://your-domain.example \
  -e GARMIN_CLIENT_ID=... \
  -e GARMIN_CLIENT_SECRET=... \
  garmin-mcp-server
```

The image is multi-stage (build → slim runtime), runs as the non-root `node`
user, and installs only production dependencies in the final layer.

## Fly.io

```bash
fly launch --no-deploy            # register the app, keep the provided fly.toml
fly secrets set GARMIN_CLIENT_ID=... GARMIN_CLIENT_SECRET=... GARMIN_SCOPES="..."
fly deploy
```

Set `PUBLIC_BASE_URL` in `fly.toml` to the deployed URL (e.g.
`https://<app>.fly.dev`). The `[[http_service.checks]]` block probes `/healthz`.

## Railway

1. Create a project from this repo; Railway auto-detects the Dockerfile.
2. Add the environment variables above in the service settings.
3. Set `PUBLIC_BASE_URL` to the generated Railway domain.

## Health check

`GET /healthz` returns `{ "name", "version", "ok": true }` for load-balancer and
uptime probes.

## Token storage in production

The default in-memory store is fine for a single instance but does not survive
restarts or scale across replicas. For multi-instance deployments, implement the
Redis backend in `src/services/token-store.ts` (the factory already accepts
`TOKEN_STORE=redis` and `REDIS_URL`).
