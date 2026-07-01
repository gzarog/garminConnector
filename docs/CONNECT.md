# Connecting to Claude (the "Connect" button)

This connector uses the same OAuth-based **Connect** flow as directory
connectors like Strava: you add the server, click **Connect**, authorize, and
your tools light up. There are two ways to get there.

- **Demo mode** — try the whole flow in minutes with sample data, no Garmin
  developer account. Best for evaluating the connector.
- **Real mode** — connect actual Garmin accounts. Needs a Garmin developer app.

---

## Option A — Demo mode (test now, no Garmin account)

1. **Run the server in demo mode** on a URL Claude can reach over HTTPS
   (deploy per [DEPLOYMENT.md](./DEPLOYMENT.md), or expose localhost with a
   tunnel such as `ngrok`/`cloudflared`):

   ```bash
   DEMO_MODE=true TRANSPORT=http PUBLIC_BASE_URL=https://<your-host> npm start
   ```

2. **Add it in Claude** → Settings → Connectors → *Add custom connector* →
   enter `https://<your-host>/mcp`.

3. Click **Connect**. Because demo mode auto-approves, you're connected
   instantly — no Garmin login.

4. Ask Claude: *"Summarize my sleep for 2026-06-28"* or *"List my recent
   activities."* You'll get realistic sample data through all 19 tools.

> Demo mode serves canned data and skips real Garmin OAuth. It still runs all
> input validation and returns the same response envelope as production, so it's
> an accurate preview of the real behavior. **Never enable it in production.**

---

## Option B — Real mode (connect real Garmin accounts)

### 1. Get Garmin developer credentials

Apply to the [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview/).
Once approved, create an app to obtain a **client ID** and **client secret**,
and register this redirect URI:

```
https://<your-host>/oauth/callback
```

### 2. Deploy with credentials

```bash
TRANSPORT=http \
PUBLIC_BASE_URL=https://<your-host> \
GARMIN_CLIENT_ID=... \
GARMIN_CLIENT_SECRET=... \
GARMIN_SCOPES="<space-separated scopes>" \
npm start
```

(Use your host's secret manager for the client secret — see
[DEPLOYMENT.md](./DEPLOYMENT.md).)

### 3. Add it in Claude and connect

1. Settings → Connectors → *Add custom connector* → `https://<your-host>/mcp`.
2. Click **Connect** → you're redirected to **Garmin Connect** to log in and
   grant access → then back to Claude, now connected.
3. Each user who connects authorizes **their own** Garmin account and only ever
   sees their own data.

---

## How it works under the hood

Claude discovers and drives everything from the server's OAuth metadata — you
don't configure client IDs or secrets in Claude:

| Endpoint | Purpose |
|----------|---------|
| `/.well-known/oauth-protected-resource` | Advertises the protected `/mcp` resource |
| `/.well-known/oauth-authorization-server` | Advertises the auth server |
| `/register` | Dynamic Client Registration (Claude registers itself) |
| `/authorize` | Starts auth (redirects to Garmin, or auto-approves in demo) |
| `/oauth/callback` | Garmin's redirect back; binds the user to their tokens |
| `/token` | Issues the bearer token Claude sends on every `/mcp` call |

Unauthenticated calls to `/mcp` return `401` with a `WWW-Authenticate` challenge
pointing at the resource metadata — which is what triggers Claude's **Connect**
prompt in the first place.

## Troubleshooting

- **No "Connect" button / connector won't add** — confirm `GET /mcp` isn't used
  (it's `POST`), that `/.well-known/oauth-protected-resource` returns JSON, and
  that `PUBLIC_BASE_URL` exactly matches the public HTTPS URL.
- **Connect fails at Garmin** — verify the redirect URI
  `https://<your-host>/oauth/callback` is registered in your Garmin app and that
  `GARMIN_CLIENT_ID`/`GARMIN_CLIENT_SECRET` are set. Or use demo mode to isolate
  whether the issue is Garmin-side.
- **401 after connecting** — the token expired or was revoked; disconnect and
  reconnect in Claude.
