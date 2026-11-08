# 🌱 Thrivie

A calm, private, mobile-friendly wellness tracker for **health, workouts, habits, goals and a journal**, with a visual dashboard, a daily brief, and an **AI Notes Import** that turns messy notes-app text into structured entries.

- **Simple.** Most entries take a few taps: one-tap habit check-offs, "repeat last workout", and a quick-log sheet on the dashboard.
- **Local-first and private.** Everything is stored in a local SQLite file. Data leaves your machine only when you use the AI features (see [Privacy](#privacy)).
- **Installable.** Works as a PWA on phones and desktops, with light and dark mode.
- **U.S. units by default** (lb, mi, fl oz). You can switch to metric in Settings at any time without losing data.

> Thrivie is for personal tracking only. It isn't medical advice.

---

## Quick start

Requirements: **Node.js 20+** (tested on 22) and npm.

```bash
git clone <this repo> thrivie && cd thrivie
npm install                 # also generates the Prisma client
cp .env.example .env        # then edit .env (see below)
npm run setup               # creates the SQLite DB and loads ~30 days of sample data
npm run dev                 # http://localhost:3000
```

### `.env`

```ini
DATABASE_URL="file:./thrivie.db"     # SQLite file, relative to prisma/
ANTHROPIC_API_KEY="sk-ant-..."        # optional – only needed for AI features
ANTHROPIC_MODEL="claude-sonnet-5-5"   # optional – defaults to claude-sonnet-5-5
```

Without an API key, everything works except AI Notes Import. The daily brief and highlights fall back to summaries written by code.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build && npm start` | Production build and server (needed to test the PWA/offline mode) |
| `npm test` | Run unit tests (Vitest) |
| `npm run lint` | Type-check the project |
| `npm run db:seed` | **Wipe** the DB and reload sample data (set `SEED_TZ=America/Chicago` to choose the timezone) |
| `npm run db:reset` | Recreate the schema from scratch and seed it |

### Install on your phone

Run a production build (`npm run build && npm start`) on a machine your phone can reach, open it in Safari or Chrome, then choose **Share → Add to Home Screen** (iOS) or **Install app** (Android/desktop Chrome). Browsers only allow installing from `https://` or `localhost`, so for phone access use an HTTPS tunnel or reverse proxy.

---

## Features

### Modules
1. **Health**: weight, sleep (hours and 1–5 quality), water, mood, energy, steps, and any custom metrics (e.g. resting HR). Every field is optional. Choosing a date loads that day's log so you can edit it. Trend charts for 7, 30 or 90 days.
2. **Workouts**: type (strength, cardio, mobility, sport, other), duration, intensity, optional exercises (sets × reps @ weight) or distance and pace (pace is calculated if left blank). Includes **Repeat last** and a weekly-volume chart stacked by type.
3. **Habits**: daily or X-times-per-week habits with one-tap check-off. Current and best streaks (counted in weeks for weekly habits), a heatmap per habit, and a 6-month overview.
4. **Goals**: target, unit, start date and deadline. Progress is either **manual** or **linked** so it updates automatically:
   - workouts: count, minutes, or distance, for one type or all
   - health metrics: total steps, total water, average sleep, or reach a weight
   - a habit: number of check-ins

   Each goal shows a progress bar with a "steady pace" marker and an on-track or behind status.
5. **Journal**: free-text entries with optional mood and prompts ("What went well today?"). Full-text search with highlighted matches.

### Dashboard
- **Today**: greeting, daily brief, quick-add buttons, today's habits to check off, and a snapshot of what's logged today.
- **Highlights**: wins and patterns **computed in code** (streak records, sleep on workout days vs rest days, mood on active days, weekly volume vs last week, distance, steps trend, goals on track). When an API key is set, the AI only rewords these facts. It never invents numbers.
- **Charts**: weight, sleep and mood trends (7/30/90-day toggle), weekly workout minutes, habit heatmap, goal progress bars.
- **Daily brief**: 3–5 sentences generated **once per day** from the last 7 days and cached in the database. It covers yesterday's recap, streaks at risk, goal status, and one gentle suggestion. A **Refresh** button regenerates it.

### AI Notes Import
Paste text from Apple Notes, Google Keep, Notion and similar apps. It can be messy, abbreviated, and cover several days:

```
Mon - ran 5k 28min, slept 6h felt tired. pushups 3x15. no sugar ✅ meditated ✅. weight 172.
Tues: rest day, 8h sleep, journaled about work stress
```

How it works:
1. A server-side call asks Claude to return **only JSON** that matches a strict schema (health logs, workouts, habit check-ins, goal updates, journal entries). Each entry has a date, the raw date text, and confidence scores per entry and per field.
2. The response is validated with **Zod**. Code fences and stray prose are tolerated. Numeric strings and out-of-range ratings are coerced or clamped. Invalid entries are dropped individually. If nothing usable comes back, the screen shows a clear error with a **Retry** button.
3. **Dates are resolved in code.** Strings like "Mon", "yesterday", "3 days ago", "11/3" and "Nov 3rd" are resolved against today in *your* timezone, and that result wins over the model's own date. Notes describe the past, so "Mon" means the most recent Monday.
4. **Units**: bare numbers use your unit setting, so "weight 172" means 172 lb in U.S. mode. Explicit units ("5k", "3 mi", "80 kg") are converted.
5. **Habits and goals are matched by name** (fuzzy: "meditated" matches "Meditate"). Anything that doesn't match shows as a **"New habit?"** suggestion that you can create or link. Nothing is created silently.
6. **Review screen**: entries are grouped by date and type. Each one can be edited, removed or approved. Low-confidence entries and fields are highlighted. **Approve all** and **Save** are at the top.
7. **Duplicate detection**: existing health logs (keep existing / overwrite / skip), same-type workouts on the same day, habits already checked off, repeated journal text, and progress for goals that update automatically.

---

## Privacy

- Data is stored in `prisma/thrivie.db` on the machine running the server. There are no accounts, analytics or third-party scripts.
- Only two features send data out, both to **Anthropic's Claude API** and both server-side (the API key never reaches the browser):
  - **AI Notes Import**: the text you paste, plus your habit and goal names (used for matching).
  - **Daily brief and highlights**: a compact summary of the last 7 days (averages, counts, habit and goal names, computed highlights). **Journal text is never sent.**
- Both are explained in the UI (on the import screen, under the brief, and in Settings).
- **Your data** in Settings has a full JSON backup, per-table CSV exports (in your display units), JSON restore, and "Delete all data".

## Tone and safety
The AI prompts require encouraging, non-judgmental language: no shaming about weight, food or missed days, and no medical advice or diagnoses. Weight comes up in highlights or the brief only as progress toward a goal you set. Requests use the server-side refusal fallback (`fallbacks: "default"`) on models that support it, and every AI failure falls back to code-written text.

---

## Tech stack

- **Next.js 15** (App Router, Server Components and Server Actions) + **TypeScript** + **Tailwind CSS 4**
- **SQLite via Prisma 6**
- **Recharts** for charts. The categorical chart palette was checked for color-blind separation.
- **Anthropic TypeScript SDK** for AI. The model is configurable (default `claude-sonnet-5-5`).
- **Zod** for validating every input and AI response
- **Vitest** for tests

### Project layout

```
prisma/
  schema.prisma        data model (dates are "YYYY-MM-DD" in the user's timezone; values stored metric)
  seed.ts              ~30 days of realistic sample data
src/app/
  page.tsx             dashboard
  health|workouts|habits|goals|journal/   module pages + forms
  import/              AI Notes Import + review screen
  settings/            settings, export/restore, delete
  actions.ts           server actions for all manual CRUD
  api/import/{parse,commit}  AI parse → review → commit
  api/brief            cached daily brief
  api/export, api/backup     JSON/CSV export and JSON restore
  manifest.ts, icons/  PWA manifest and icons (public/sw.js = service worker)
src/lib/
  dates.ts             timezone-aware "today" + relative date resolution
  units.ts             U.S. ↔ metric conversion
  stats.ts             streaks, goal pace/status
  insights.ts          highlights computed from data
  queries.ts           DB loaders (habit views, goal progress, ranges)
  ai.ts                Claude client wrapper (server-only)
  brief.ts             daily brief context, prompt, cache, fallback
  import/schema.ts     AI JSON schema (Zod), system prompt, parser
  import/normalize.ts  date/unit normalization, habit/goal matching
  import/server.ts     duplicate detection + transactional commit
tests/                 date resolution, AI parsing/validation, normalization, streaks/goals/insights
```

### Design notes
- **Storage is always metric.** Switching between U.S. and metric only changes display and input, so it is lossless.
- **"Today" comes from the timezone set in Settings**, not the server clock. On a UTC server the seed script defaults to `America/New_York`. Settings has a "Use this device" button to pick up your local zone.
- AI output is never trusted directly. It is parsed, validated, normalized and shown for review before anything is written, and writes run in a single transaction.

## Troubleshooting
- **"AI import needs an ANTHROPIC_API_KEY"**: add the key to `.env` and restart the server.
- **"Model … wasn't found"**: check `ANTHROPIC_MODEL` in `.env`.
- **Dates look off by a day**: set your timezone in Settings.
- **Start fresh**: `npm run db:reset`.
