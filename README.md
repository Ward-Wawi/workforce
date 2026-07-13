# Emporio — Time & Payroll

Multi-tenant time tracking and payroll management (React + Vite + Supabase).

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A Supabase project with the schema migrations applied

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and fill in your Supabase credentials from **Project Settings → API**:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Apply database migrations** (if not already done)

   Run in the Supabase SQL Editor, in order:

   - `supabase/migrations/20250713141000_initial_schema.sql`
   - `supabase/migrations/20250713150000_phase1_invite_functions.sql`

4. **Start the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173).

## Phase 1 — What's included

- Email/password signup and login (Supabase Auth)
- Organization creation (name, timezone, industry) with owner membership
- Protected routing — users without an org are sent to setup
- Team invite flow (add existing users by email + role)
- Attendance settings page (org-level rules from `settings` table)
- Row Level Security enforced at the database layer

## Auth flow

1. **Sign up** → create Supabase Auth user
2. **Create organization** → `organizations` row + `memberships` row (`role = owner`)
3. **Dashboard** → org-scoped app shell
4. **Invite team** → RPC adds membership for users who already signed up

## Project structure

```
src/
  components/     Shared UI (layout, forms, route guards)
  context/        Auth + organization state
  lib/            Supabase client
  pages/          Login, signup, org setup, dashboard, invite, settings
  types/          Shared TypeScript types
supabase/
  migrations/     SQL schema + RLS + RPC functions
```
