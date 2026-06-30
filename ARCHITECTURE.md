# Garmin Connect MCP Server — Architecture Overview

## Vision

A production-grade MCP connector for Claude.ai that gives users natural-language access to their Garmin Connect health, fitness, and activity data — listed in the official Claude Connectors Directory alongside Strava, Slack, and Google Drive.

---

## Two-Track Prerequisite Plan

### Track 1: Garmin Connect Developer Program

**What**: Apply at https://developer.garmin.com/gc-developer-program/overview/  
**Cost**: Free for approved business developers  
**Timeline**: ~2 business days for approval, 1–4 weeks integration  
**Framing**: "Building a Garmin data connector for Anthropic's Claude AI platform (MCP protocol) — enabling users to query their health/fitness data via natural language."

**APIs you'll get access to:**

| API | Direction | Data |
|-----|-----------|------|
| Health API | Garmin → Server | HR, steps, calories, sleep, stress, pulse ox, Body Battery, body composition, respiration, enhanced beat-to-beat intervals |
| Activity API | Garmin → Server | Full activity data for 30+ activity types (runs, cycling, CrossFit, etc.) |
| Women's Health API | Garmin → Server | Menstrual cycle / pregnancy tracking |
| Training API | Server → Garmin | Push structured workouts and training plans to devices |
| Courses API | Server → Garmin | Push GPS courses to devices |

**Auth**: OAuth 2.0 (aligns perfectly with Claude's connector requirements)  
**Data format**: JSON, REST architecture  
**Delivery**: Ping/Pull or Push (webhook) — we'll implement both

### Track 2: Claude Connectors Directory Submission

**Requirements** (from https://claude.com/docs/connectors/building/submission):

1. **Organization**: Need a Claude **Team or Enterprise** plan to access the submission portal
2. **Remote MCP server** with Streamable HTTP transport
3. **OAuth 2.0** authentication (✅ matches Garmin)
4. **Tool annotations**: All tools must include `title`, `readOnlyHint`, `destructiveHint`
5. **Privacy Policy**: Public URL covering data collection, storage, sharing, retention
6. **Documentation**: Public setup/usage docs (blog post or help center sufficient)
7. **Test account**: Fully populated account with step-by-step reviewer instructions
8. **Branding**: Logo (SVG), favicon, screenshots for MCP Apps

**Submission**: Via https://clau.de/mcp-directory-submission  
**Review**: Queue-based, no fixed SLA

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Claude.ai                            │
│                    (MCP Host / Client)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ Streamable HTTP (JSON-RPC 2.0)
                       │ OAuth 2.0 token in header
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              garmin-mcp-server (TypeScript)                  │
│                                                             │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  MCP Layer    │  │  Auth Layer  │  │  Garmin API      │ │
│  │               │  │              │  │  Client          │ │
│  │  • Tools      │  │  • OAuth 2.0 │  │                  │ │
│  │  • Resources  │  │  • Token     │  │  • Health API    │ │
│  │  • Prompts    │  │    refresh   │  │  • Activity API  │ │
│  │               │  │  • Per-user  │  │  • Training API  │ │
│  │               │  │    sessions  │  │  • Courses API   │ │
│  └───────────────┘  └──────────────┘  └──────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Data Layer (optional cache)                         │   │
│  │  • In-memory / Redis for token storage               │   │
│  │  • Webhook receiver for Garmin push notifications    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ REST / OAuth 2.0
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Garmin Connect Platform                        │
│              (Developer Program APIs)                       │
└─────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
User clicks "Connect Garmin" in Claude.ai
    │
    ▼
Claude.ai redirects to garmin-mcp-server /authorize
    │
    ▼
Server redirects to Garmin OAuth 2.0 authorization URL
    │
    ▼
User grants permission on Garmin Connect
    │
    ▼
Garmin redirects to server callback with auth code
    │
    ▼
Server exchanges code for access_token + refresh_token
    │
    ▼
Server redirects to Claude.ai callback:
  https://claude.ai/api/mcp/auth_callback
    │
    ▼
Claude.ai stores token, subsequent MCP calls include it
```

---

## MCP Tools Design

### Health Data Tools (Read-only)

| Tool | Description |
|------|-------------|
| `garmin_get_daily_summary` | Steps, calories, distance, intensity minutes, floors for a date range |
| `garmin_get_heart_rate` | Resting HR, HR zones, timestamped HR samples |
| `garmin_get_sleep` | Sleep stages, duration, score, sleep/wake times |
| `garmin_get_stress` | Stress level summaries and timestamped samples |
| `garmin_get_body_battery` | Body Battery charged/drained values over time |
| `garmin_get_pulse_ox` | SpO2 readings (sleep and on-demand) |
| `garmin_get_respiration` | Breathing rate summaries |
| `garmin_get_body_composition` | Weight, BMI, body fat %, muscle mass, bone mass |
| `garmin_get_hrv` | Heart rate variability status and readings |
| `garmin_get_hydration` | Daily hydration intake |

### Activity Tools (Read-only)

| Tool | Description |
|------|-------------|
| `garmin_list_activities` | List activities with filters (type, date range, sport) |
| `garmin_get_activity_detail` | Full activity detail: laps, splits, HR zones, elevation, pace |
| `garmin_get_activity_splits` | Per-km/mile splits with pace, HR, elevation |
| `garmin_search_activities` | Search activities by keyword, sport type, metrics |

### Training Tools (Write)

| Tool | Description |
|------|-------------|
| `garmin_push_workout` | Send a structured workout to user's Garmin device |
| `garmin_push_training_plan` | Send a multi-day training plan |
| `garmin_push_course` | Push a GPS course for navigation |

### Utility Tools

| Tool | Description |
|------|-------------|
| `garmin_get_user_profile` | User profile, device info, units preferences |
| `garmin_get_devices` | List connected Garmin devices |

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | Best MCP SDK support, type safety, Claude directory standard |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK, `registerTool` API |
| Transport | Streamable HTTP | Required for remote Claude.ai connector |
| HTTP Framework | Express | SDK examples use it, battle-tested |
| Validation | Zod | SDK-native schema validation |
| Auth | OAuth 2.0 | Both Garmin and Claude require it |
| Hosting | Cloudflare Workers / Railway / Fly.io | TBD based on preference |
| Token Storage | Redis / KV | Per-user OAuth tokens |

---

## Project Structure

```
garmin-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── ARCHITECTURE.md
├── PRIVACY_POLICY.md
├── .env.example
├── src/
│   ├── index.ts                 # Entry point, transport setup
│   ├── server.ts                # McpServer initialization, tool registration
│   ├── constants.ts             # API URLs, limits, defaults
│   ├── types.ts                 # TypeScript interfaces
│   ├── schemas/
│   │   ├── health.ts            # Zod schemas for health tool inputs
│   │   ├── activities.ts        # Zod schemas for activity tool inputs
│   │   └── training.ts          # Zod schemas for training tool inputs
│   ├── services/
│   │   ├── garmin-client.ts     # Garmin API HTTP client (auth, retry, pagination)
│   │   ├── auth.ts              # OAuth 2.0 flow handlers
│   │   └── token-store.ts       # Token persistence (Redis/KV/memory)
│   └── tools/
│       ├── health.ts            # Health API tools
│       ├── activities.ts        # Activity API tools
│       ├── training.ts          # Training/Courses API tools (write)
│       └── user.ts              # Profile, devices tools
└── dist/                        # Compiled JS output
```

---

## Hosting Options

| Option | Pros | Cons |
|--------|------|------|
| **Cloudflare Workers** | Edge deployment, free tier, built-in KV for tokens, OAuth helpers | Worker size limits, cold start considerations |
| **Railway** | Easy deploy, persistent storage, no cold starts | Monthly cost (~$5+) |
| **Fly.io** | Global edge, persistent volumes, free tier | More setup complexity |
| **Self-hosted VPS** | Full control, cheapest long-term | Maintenance burden |

**Recommendation**: Start with Railway or Fly.io for simplicity, consider Cloudflare Workers for scale.

---

## Development Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Apply to Garmin Connect Developer Program
- [ ] Set up project scaffold (this is done ✅)
- [ ] Implement OAuth 2.0 flow with Garmin
- [ ] Build Garmin API client with token management
- [ ] Implement first 3 health tools (daily summary, heart rate, sleep)

### Phase 2: Full Health Coverage (Week 2)
- [ ] Implement remaining health tools (stress, Body Battery, pulse ox, HRV, body comp)
- [ ] Implement activity listing and detail tools
- [ ] Add pagination, date range filtering, response formatting
- [ ] Test with MCP Inspector

### Phase 3: Training & Polish (Week 3)
- [ ] Implement training/courses push tools
- [ ] Add comprehensive error handling
- [ ] Write privacy policy
- [ ] Write public documentation
- [ ] Deploy to hosting platform

### Phase 4: Directory Submission (Week 4)
- [ ] Ensure Claude Team/Enterprise org access
- [ ] Create test account with populated data
- [ ] Prepare branding assets (logo, screenshots)
- [ ] Submit via https://clau.de/mcp-directory-submission
- [ ] Address review feedback

---

## Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Garmin rejects developer program application | Blocker | Frame as legitimate integration product; fall back to Garth (unofficial OAuth) |
| Claude directory requires Team/Enterprise plan | Cost | ~$25/mo for Team plan; required investment for listing |
| Garmin API rate limits | Quality | Implement caching layer, respect rate limits, use push architecture |
| Health data privacy requirements | Compliance | Clear privacy policy, minimal data retention, user consent flow |
| Review rejection | Delay | Follow review criteria strictly, test all tools before submission |
