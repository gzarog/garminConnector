# Privacy Policy — garmin-mcp-server

_Last updated: 2026-06-30_

This privacy policy describes how the **Garmin Connect MCP Server** ("the
Service") handles your data when you connect it to Claude.ai or another
Model Context Protocol (MCP) client.

## What this Service is

The Service is an MCP connector that lets an AI assistant (such as Claude)
read your Garmin Connect health, fitness, and activity data and, when you
explicitly ask, push structured workouts or GPS courses to your Garmin
device. It acts as a bridge between your MCP client and the official Garmin
Connect Developer Program APIs.

## Data we access

When you authorize the Service through Garmin's OAuth 2.0 flow, you grant it
permission to access, on your behalf:

- **Health data** — daily summaries, heart rate, sleep, stress, Body Battery,
  pulse oximetry (SpO2), heart-rate variability, respiration, hydration, and
  body composition.
- **Activity data** — activity lists, details, laps, splits, and related
  metrics.
- **Profile data** — basic profile, device list, and unit preferences.

We only request the OAuth scopes needed for the tools you use.

## How we use data

Data retrieved from Garmin is used solely to answer the requests you make
through your MCP client. It is fetched on demand, returned to your client,
and not used for any other purpose. We do **not** sell, rent, or share your
health or activity data with third parties.

## Data storage and retention

- **OAuth tokens** — Access and refresh tokens are stored only to maintain
  your session (in memory or in a configured key/value store such as Redis).
  They are deleted when you disconnect the Service or when they expire and
  cannot be refreshed.
- **Health and activity data** — Fetched on demand and returned to your MCP
  client. The Service does not persistently store your health or activity
  data. Any optional cache exists only to respect Garmin rate limits and is
  short-lived.

## Data sharing

The Service shares data only with:

1. **Your MCP client** (e.g. Claude.ai), which initiated the request.
2. **Garmin Connect**, the source of the data, via authenticated API calls.

No other parties receive your data.

## Your controls

- **Revoke access** at any time from your Garmin Connect account's connected
  apps settings, or by disconnecting the connector in your MCP client.
- Revoking access invalidates the stored tokens and ends the Service's
  ability to access your data.

## Security

- All communication uses HTTPS / TLS.
- Authentication uses OAuth 2.0; the Service never sees your Garmin password.
- Tokens are stored with restricted access and removed on disconnect.

## Changes to this policy

We may update this policy as the Service evolves. Material changes will be
reflected in this document with an updated "Last updated" date.

## Contact

For privacy questions or data requests, please open an issue in the project
repository.
