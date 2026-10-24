# Aman

Aman means safety or peace in Urdu and Amharic. It is offline screening and referral support for a sick child, built at HackPSU Fall 2026.

A community health worker answers the child-illness chart questions on a phone, counts breaths, and gets a referral decision: `HOME`, `REFER_SOON` or `GO_NOW`. The decision comes with plain-language reasons and a caregiver card in English, Urdu or Amharic. Families can also send a voice note. The clinic dashboard shows incoming cases ranked by urgency, live.

**Screening support. Not a diagnosis.** Read [docs/SAFETY.md](docs/SAFETY.md) before demoing.

## What decides the referral

- Only the rule-based protocol engine (`packages/protocol`) decides. The thresholds in `packages/protocol/protocol.json` are copied from the published WHO IMCI / IMNCI chart booklet and cited there. The loader refuses to run if any `TODO` is left in.
- **Audio can only raise `HOME` to `REFER_SOON`.** That happens only when cough is true and the score is a finite value from 0 to 1 at or above `tauHigh` in `protocol.json`. It never lowers urgency and never produces `GO_NOW`. An invalid score does not escalate and flags the case for review. `tauHigh` is chosen on synthetic validation tones. The head does not choose the outcome.
- Missing answers never produce `HOME`; the case becomes at least `REFER_SOON` and is flagged for human review.
- Gemini only transcribes and extracts facts from voice notes. It never picks the outcome.

## Layout

```
apps/web          Vite + React PWA: field flow (/), clinic dashboard (/clinic), voice upload (/voice), model limits (/limits)
apps/server       Fastify API, SQLite, SSE stream, Telegram bot, Gemini extraction; serves the built web app
packages/types    Shared types and zod schemas (CaseRecord, Clinic, ...)
packages/protocol Decision engine, protocol.json (cited), synthetic clinics, 30+ case test table
packages/audio    Log-mel features, experimental score, occlusion saliency, clip quality checks
packages/content  Bundled en/ur/am text: reasons, caregiver card, questions (ur/am are drafts)
ml/               Synthetic-tone training with subject-level splits, metrics.json, golden parity fixture
docs/             SAFETY.md, DEMO.md
```

## Setup

Prerequisites: Node 20+, pnpm 10, Python 3.11+ (only to retrain).

```bash
pnpm install
cp .env.example .env        # optional: add GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, DASHBOARD_PIN
pnpm test                   # protocol table, audio parity, content, server API
pnpm build                  # builds the PWA into apps/web/dist
pnpm seed                   # optional: a few synthetic cases for the dashboard
pnpm start                  # http://localhost:3000 serves the API and the built app
```

For development, `pnpm dev` runs Vite on port 5173 (proxying `/api`) and the server on port 3000 with reload.

To retrain the experimental model and refresh `ml/metrics.json`, the exported head and the golden fixture:

```bash
pip install -r ml/requirements.txt
pnpm train
pnpm test
```

### Environment

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Voice-note extraction. Without it, voice endpoints return 503 and the rest works. |
| `GEMINI_MODEL` | Defaults to `gemini-3.8-flash`. |
| `TELEGRAM_BOT_TOKEN` | Starts the long-polling Telegram bot. Without it, the bot is off. |
| `DASHBOARD_PIN` | Shared demo PIN for `/clinic` and `/voice`. Defaults to `demo`. A placeholder, not real authentication. |
| `DATABASE_PATH` | SQLite file. Relative paths resolve from `apps/server`. |
| `PORT` | Defaults to 3000. |

Phones need HTTPS for the microphone. Deploy the single Node server (Render, Railway or Fly), or tunnel a laptop with `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`.

## API

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/cases` | open (field sync) | Upsert by `id`. The server re-runs the protocol and ignores any client decision. Re-posting keeps the clinic's status and assignment. |
| `GET /api/cases?status=` | PIN | Sorted by GO_NOW, then REFER_SOON, then HOME; then youngest first (unknown age last); then longest waiting. |
| `PATCH /api/cases/:id` | PIN | `status` or `clinicId`. |
| `POST /api/cases/:id/route` | PIN | Nearest clinic with capacity, by Haversine distance; prefers a language match, with distance weighted more for GO_NOW. |
| `GET /api/clinics` | PIN | Synthetic clinics. |
| `GET /api/stream?pin=` | PIN | Server-sent events for live dashboard updates. |
| `POST /api/voice-intake` | PIN | Raw audio body (`audio/*`); the same extraction path as Telegram. |
| `POST /api/voice-intake/:id/answer` | PIN | `{ field, value }` follow-up answer. |

## HackPSU Fall 2026 deadlines

Checked against the [official rules](https://hackpsu-fall-2026.devpost.com/rules) on Oct 24, 2026:

- Hacking runs from 2:00 PM ET on Saturday, Oct 24 to 1:45 PM ET on Sunday, Oct 25. All project code must be written in that window.
- The Devpost submission must be created by midnight on Saturday night. The hard deadline is **12:00 PM (noon) ET on Sunday, Oct 25**. Edits are allowed until 1:45 PM. The Devpost dates page shows submissions closing at 2:00 PM EDT; follow the stricter noon deadline.
- Include a public repo link, a video of up to 5 minutes, and every team member. Cite the open-source packages and data used (see below).

## Credits and citations

- WHO, *Revised WHO classification and treatment of childhood pneumonia at health facilities* (2014), and the Zimbabwe IMNCI chart booklet (2016); full citations are in `protocol.json`.
- Noto Sans Ethiopic and Noto Naskh Arabic (SIL Open Font License), bundled in `apps/web/public/fonts`.
- Map tiles © OpenStreetMap contributors.
- Open-source packages: React, Vite, Tailwind CSS, vite-plugin-pwa (Workbox), Dexie, Leaflet, react-leaflet, Fastify, zod, better-sqlite3, grammY, @google/genai, Vitest, NumPy, scikit-learn.
