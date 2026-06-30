# IELTSUZ

AI-powered IELTS preparation platform — **Next.js-only**, no Python backend. All AI (speaking, writing, listening, reading grading + study plans) runs via **Google Gemini 2.5-flash** directly inside Next.js API routes. Payment is local **Payme/Click** verified by Gemini Vision screenshot analysis. Free users get **3 trial evaluations per skill + 3 mock tests**; a built-in **referral system** lets users earn bonus mock tests by inviting friends.

## Tech Stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Frontend  | Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion |
| Database  | Supabase (PostgreSQL + Auth + RLS)                                |
| AI        | Google Gemini 2.5-flash (speaking, writing, listening, reading, study plans, payment verification) |
| Payment   | Payme / Click (manual UZS transfer + Gemini Vision screenshot check) |

## Project Structure

```
IELTSOS/
├── frontend/          # Next.js 14 app (all UI + API routes + AI logic)
│   ├── app/           # App Router pages
│   │   ├── (auth)/    # Login, Register, Onboarding
│   │   ├── (dashboard)/ # Dashboard, Skills, Mock Test, Progress, Vocabulary, Upgrade
│   │   └── api/       # Next.js API routes (Gemini evaluation, payment, etc.)
│   ├── components/    # React components
│   ├── hooks/         # useAuth, useProStatus, useTrialGuard
│   └── lib/           # supabaseServer, gemini, api helpers, types
├── supabase/
│   ├── schema.sql     # Main DB schema (profiles, results, vocab, payments, trials, referrals)
│   └── schema_admin.sql # Admin helpers
└── README.md
```

> **No Python backend.** Cambridge PDFs/MP3s are embedded directly in the frontend
> (iframe + audio tags) where users read real book questions and type answers into
> a numbered grid. AI grades from the user's typed answers.

## 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the entire `supabase/schema.sql`, then `supabase/schema_admin.sql`.
3. Grab your keys from Project Settings → API:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
GEMINI_API_KEY=your_gemini_api_key

# Payment config (Payme / Click)
NEXT_PUBLIC_CARD_NUMBER=8600123456789012
CARD_NUMBER=8600123456789012
CARD_OWNER=YOUR NAME
NEXT_PUBLIC_CARD_OWNER=YOUR NAME
MONTHLY_PRICE_UZS=49000

# Service-role key — server-only, used ONLY for code-based payment
# verification so a phone can confirm a payment without its own session
# (e.g. scanning the QR shown on a logged-in desktop).
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** It is used exclusively inside
> the payment route handlers (`/api/payment/status`, `/api/payment/upload`) so a
> phone opening `/pay/{code}` works even without a session. It must NEVER be
> exposed to the browser. Normal user auth still works via the user's Bearer
> token from `supabase-js` localStorage with RLS applied. Do NOT reintroduce the
> `@supabase/ssr` cookie pattern — it breaks auth here.

## 3. Run Locally

```bash
cd frontend
npm install
npm run dev
```

Frontend usually starts at http://localhost:3000 (may land on 3001/3004 if busy).

## Features

### Auth & Onboarding
- Email + password registration (6-step wizard: name → email → IELTS experience → level/bands → target band → password)
- Protected dashboard routes
- AI-generated study plan on first login

### Trial System
Every new user starts with **3 free uses** per skill:
- Listening evaluation
- Reading evaluation
- Speaking evaluation
- Writing evaluation
- Mock test

Once all trials hit 0, non-pro users are redirected to `/upgrade`.

### Pro Upgrade (Payme / Click)
1. User goes to `/upgrade` and sees the card number + price.
2. Pays via Payme or Click app.
3. Uploads a screenshot on the same page.
4. Gemini Vision verifies the screenshot (amount, recipient card last-4, date, success status).
5. If approved, 30-day Pro access is granted (`is_pro = true`, `pro_expires_at = +30 days`).

### Referral System
- Every user gets an auto-generated promo code (e.g. `IELTS-550e8400e29b`) stored in `profiles.promo_code`.
- A new user can enter a friend's promo code during registration.
- When a valid code is used, the **referrer earns +1 bonus mock test** (`bonus_mock_remaining`).
- Bonus mocks are consumed **after** the free trial mocks run out.
- Self-referral is blocked; each user can only use one referral code once.

### Skills

| Skill | Path | Flow |
|-------|------|------|
| **Speaking** | `/speaking` → `/speaking/[partId]` or `/speaking/full-test` | Record answers with MediaRecorder, Gemini transcribes + evaluates fluency, vocabulary, grammar, pronunciation. **Full Test** runs Part 1 → 2 → 3 in one session and scores them holistically (overall band + per-part bands). |
| **Writing** | `/writing` → `/writing/[taskId]` | Essay editor with timer & live word count. Gemini grading: task achievement, coherence, lexical resource, grammar. Includes sentence corrections, model answer, new vocabulary. |
| **Listening** | `/listening` → `/listening/[testId]` | Embedded Cambridge PDF (iframe) + custom audio player. User types answers into a numbered grid. Gemini compares against an answer key and gives band + weak-area analysis. |
| **Reading** | `/reading` → `/reading/[testId]` | Same PDF embed + numbered answer grid. Gemini grades against extracted passage text. |
| **Mock Test** | `/mock-test` → `/mock-test/[mockId]` | 4-skill session. After completing each skill, user records their band. Clicking **Finish** computes an overall band, saves results, and shows a radar chart + AI recommendation. |

### Progress & Vocabulary
- **Progress** (`/progress`): band trend over time, best results, GitHub-style activity calendar, streak counter, AI study tips.
- **Vocabulary** (`/vocabulary`): words added from any skill, flashcards, daily review with spaced repetition (1/3/7/14/30-day intervals).

### Admin Analytics (`/analytics`)
Real-time platform dashboard (auto-refreshes every 15s). **Admin-only** — the
`/api/analytics/stats` route verifies the caller is an authenticated user with
`is_admin = true` before returning data. Shows:
- Total registered users, new users today
- Currently online (activity in last 10 min) and daily active (last 24h)
- Paid/Pro users, total verified revenue & payment count
- Tests completed today + a 7-day daily-active-users bar chart

> Grant admin access with: `UPDATE profiles SET is_admin = TRUE WHERE email = 'you@example.com';`

## API Routes (Next.js)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/speaking/evaluate` | Audio blob → Gemini transcribe + evaluate → band + feedback |
| POST | `/api/writing/evaluate` | Essay text → Gemini grade → band + corrections |
| POST | `/api/listening/feedback` | Answers + answer key → Gemini analysis → band + weak areas |
| POST | `/api/reading/feedback` | Answers + passage → Gemini grade → band + tips |
| POST | `/api/mock-test/evaluate` | Save overall bands + AI feedback |
| POST | `/api/payment/start` | Create a pending payment + unique code |
| GET | `/api/payment/status/{code}` | Poll payment status by code (no session needed) |
| POST | `/api/payment/upload` | Screenshot → Gemini Vision → auto-approve + grant 30-day Pro |
| GET | `/api/payment/my-payments` | Current user's payment history |
| POST | `/api/auth/apply-referral` | Validate promo code, give referrer +1 bonus mock |
| GET/POST/PATCH | `/api/study-plan/*` | AI study plan generation & retrieval |
| GET/POST/PATCH | `/api/vocabulary/*` | Add words, review, spaced repetition |
| GET | `/api/progress/*` | History, stats, recommendations |

## Database Schema (Supabase)

Key tables:

- `profiles` — user data, trial counters, pro status, promo code, referral tracking
- `speaking_results`, `writing_results`, `listening_results`, `reading_results` — per-skill evaluation history
- `mock_test_results` — overall mock test scores
- `vocabulary` — user's saved words with spaced-repetition state
- `payments` — screenshot hashes, verification results, Pro activations
- `cambridge_tests` — test metadata + answer keys (optional)

### Trial & Referral Columns (profiles)

```sql
trial_listening_remaining INTEGER DEFAULT 3
trial_reading_remaining   INTEGER DEFAULT 3
trial_speaking_remaining  INTEGER DEFAULT 3
trial_writing_remaining   INTEGER DEFAULT 3
trial_mock_remaining      INTEGER DEFAULT 3
bonus_mock_remaining      INTEGER DEFAULT 0
promo_code                TEXT UNIQUE
referred_by               TEXT
is_pro                    BOOLEAN
pro_expires_at            TIMESTAMPTZ
```

## Auth Architecture

- **Frontend**: `supabase-js` stores the session in `localStorage`.
- **API calls**: `lib/api.ts` sends `Authorization: Bearer <access_token>` header.
- **API routes**: `lib/supabaseServer.ts` creates a `supabase-js` client using the Bearer token + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. RLS policies run as the logged-in user.
- **No cookies, no service role key on the frontend.**

## Launch Checklist

- [x] Auth: register / login / protected routes
- [x] Trial limits: 3 free evaluations per skill + 3 mock tests
- [x] Pro upgrade: Payme/Click + Gemini Vision screenshot verification
- [x] Referral system: auto promo codes + bonus mock rewards
- [x] Speaking: MediaRecorder → Gemini transcribe + evaluate
- [x] Writing: essay editor → Gemini grade + corrections + model answer
- [x] Listening: PDF embed + audio player + numbered grid + AI feedback
- [x] Reading: PDF embed + numbered grid + AI grading
- [x] Mock Test: 4-skill flow + overall band + radar chart
- [x] Vocabulary: add from any skill + flashcards + spaced repetition
- [x] Progress: band trends, activity calendar, streak, AI tips
- [x] AI Study Plan: generated on onboarding, shown on dashboard
- [x] Responsive, dark theme, loading + error states throughout

## Production Deployment

**Vercel (frontend only):**

```bash
cd frontend
vercel deploy --prod
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_CARD_NUMBER`
- `CARD_NUMBER`
- `CARD_OWNER`
- `NEXT_PUBLIC_CARD_OWNER`
- `MONTHLY_PRICE_UZS` (e.g. `49000`)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; enables cross-device payment confirmation + admin analytics)
- `NEXT_PUBLIC_SITE_URL` (your live domain, e.g. `https://ieltsuz.com`) — powers sitemap, robots, canonical & Open Graph for SEO

### SEO checklist (after deploy)
- Set `NEXT_PUBLIC_SITE_URL` to the real domain so `sitemap.xml`, `robots.txt`, canonical tags and social cards use it.
- Verify the domain in [Google Search Console](https://search.google.com/search-console) and paste the code into `metadata.verification.google` in `app/layout.tsx`.
- Submit `https://ieltsuz.com/sitemap.xml` in Search Console.
- Favicon, Apple icon, PWA manifest and an Open Graph share image are auto-generated from `app/icon.svg`, `app/apple-icon.tsx`, `app/manifest.ts` and `app/opengraph-image.tsx`.

No separate backend server is needed — everything runs inside Next.js API routes.

## Design Tokens

Dark theme — background `#0A0A0F`, accent indigo `#6366F1`, purple `#8B5CF6`,
green `#10B981`, red `#EF4444`, yellow `#F59E0B`. Font: Inter. Radius 12/16px.
