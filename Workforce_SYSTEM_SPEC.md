# Emporio Time & Payroll Management System — Technical Specification

**Purpose of this document:** This is a complete build specification for Claude Code. It describes the system architecture, database schema, business logic, and feature requirements in enough detail to implement without additional clarification. Where logic is critical (especially payroll processing), it is described as an explicit algorithm, not just a feature description.

---

## 1. Project Overview

**System Name:** Emporio Time & Payroll Management System

**What it is:** A multi-tenant SaaS web application for time tracking, attendance, and payroll calculation, designed to be sold to multiple warehouse/business customers ("organizations") from a single codebase and database.

**Business model:** One deployed application serves many customer organizations. Each organization's data is fully isolated from every other organization's data, even though they share the same database and tables. Pricing is per-employee or per-tier (decide later; architecture supports either).

**Core user roles (per organization):**
1. **Owner/Administrator** — full access within their organization
2. **Manager** (optional, can be added later) — scoped access to their department/team
3. **Employee** — access to only their own data

**Non-negotiable architectural rule:** Every table that stores organization-specific data must include an `organization_id` foreign key, and every row must be inaccessible to users outside that organization. This is enforced at the database level via Postgres Row Level Security (RLS), not only in application code.

---

## 2. Tech Stack

- **Frontend:** React + Vite
- **Backend/Database:** Supabase (Postgres + Auth + Row Level Security + Storage + Edge Functions)
- **Styling:** Tailwind CSS
- **PDF generation:** For pay stubs and reports (e.g., a library like `pdf-lib` or a Supabase Edge Function that generates PDFs server-side)
- **Billing:** Stripe (Subscriptions + Webhooks), integrated later — schema should accommodate it from the start
- **Hosting:** Frontend on Vercel/Netlify; Supabase hosts the backend

---

## 3. Multi-Tenancy Architecture

### 3.1 Isolation strategy
**Shared database, shared tables, `organization_id` column + Row Level Security.** This is the standard SaaS pattern — one codebase, one database, tenants isolated logically and enforced at the database layer.

### 3.2 How it works
- Every organization-scoped table has an `organization_id UUID` column referencing `organizations.id`
- Every table has an RLS policy: a user can only `SELECT`/`INSERT`/`UPDATE`/`DELETE` rows where `organization_id` matches the organization(s) they belong to
- A user's organization membership (and role within it) is stored in a `memberships` table
- The frontend never needs to manually filter by `organization_id` for security — RLS makes it structurally impossible to leak cross-tenant data even if a query is written carelessly. (Application code should still filter for correctness/performance, but security does not depend on it.)

### 3.3 Signup flow
1. New customer visits signup page, creates an account (becomes a Supabase Auth user)
2. They create an **Organization** (name, timezone, industry type) → they become that organization's Owner via a `memberships` row with `role = 'owner'`
3. Owner invites employees via email, or manually creates employee records with PIN/QR credentials (employees may not need email/password login at all — see Section 8)
4. Owner configures departments, attendance rules, and pay settings before going live

---

## 4. Database Schema

Below is the full table structure. Use this as the basis for Supabase migrations.

### 4.1 `organizations`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| timezone | text | e.g. "America/New_York" |
| industry | text | optional, e.g. "warehouse" |
| subscription_status | text | 'trialing', 'active', 'past_due', 'canceled' |
| subscription_plan | text | plan tier identifier |
| stripe_customer_id | text | nullable |
| stripe_subscription_id | text | nullable |
| seat_count | integer | active employee count, for billing |
| created_at | timestamptz | |

### 4.2 `memberships`
Links a Supabase Auth user to an organization with a role. A user *could* belong to more than one organization (e.g., a consultant), so this is a join table rather than a column on `users`.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → auth.users | |
| organization_id | uuid, FK → organizations | |
| role | text | 'owner', 'admin', 'manager', 'employee' |
| created_at | timestamptz | |

### 4.3 `departments`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| organization_id | uuid, FK | |
| name | text | |
| manager_employee_id | uuid, FK → employees, nullable | |
| created_at | timestamptz | |

### 4.4 `employees`
This is the core profile table. Note: an employee may or may not have a linked `auth.users` account — some employees may only ever use PIN/QR clock-in and never log into a portal, while others use the employee portal (requires an account).

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| organization_id | uuid, FK | |
| user_id | uuid, FK → auth.users, nullable | null if employee has no portal login |
| employee_number | text | unique per organization |
| first_name | text | |
| last_name | text | |
| email | text, nullable | |
| phone | text, nullable | |
| position | text | |
| department_id | uuid, FK → departments | |
| manager_id | uuid, FK → employees, nullable | self-referencing |
| hourly_rate | numeric(10,2) | |
| overtime_rate | numeric(10,2) | can be auto-calculated as 1.5x or manually set |
| hire_date | date | |
| status | text | 'active', 'disabled', 'terminated' |
| pin_code | text, hashed | for PIN clock-in |
| qr_code_token | text, unique | for QR clock-in |
| emergency_contact_name | text, nullable | |
| emergency_contact_phone | text, nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 4.5 `schedules`
Weekly recurring schedule per employee.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| organization_id | uuid, FK | |
| employee_id | uuid, FK | |
| day_of_week | integer | 0–6 |
| start_time | time | |
| end_time | time | |
| created_at | timestamptz | |

### 4.6 `attendance` (the core time-tracking table)
This is the most important table in the system — payroll logic reads from it directly.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| organization_id | uuid, FK | |
| employee_id | uuid, FK | |
| clock_in | timestamptz | |
| clock_out | timestamptz, nullable | NULL = currently active shift |
| total_break_minutes | integer, default 0 | sum of linked breaks |
| worked_minutes | integer, nullable | computed when clock_out is set: (clock_out - clock_in) - break time |
| payroll_status | text | **'pending'** or **'processed'** — see Section 6 |
| payroll_id | uuid, FK → payroll, nullable | set only when payroll_status = 'processed' |
| source | text | 'qr', 'pin', 'rfid', 'nfc', 'manual_admin' |
| is_manual_entry | boolean, default false | true if admin-created, not from a real clock event |
| edited_by | uuid, FK → auth.users, nullable | who last edited this record, if edited |
| edit_reason | text, nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Important:** attendance records are NEVER deleted. Corrections are made via `UPDATE` with `edited_by`/`edit_reason` logged, and always mirrored to the audit log.

### 4.7 `breaks`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| organization_id | uuid, FK | |
| attendance_id | uuid, FK → attendance | which shift this break belongs to |
| start_time | timestamptz | |
| end_time | timestamptz, nullable | |
| duration_minutes | integer, nullable | computed on end |
| created_at | timestamptz | |

### 4.8 `payroll` (a payroll run/batch)
Represents one processed payroll event — could cover one employee or a batch of employees for a given pay period.

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | this is the "Payroll ID" referenced elsewhere |
| organization_id | uuid, FK | |
| pay_period_start | date | |
| pay_period_end | date | |
| status | text | 'draft', 'processed' |
| processed_at | timestamptz, nullable | |
| processed_by | uuid, FK → auth.users | admin who clicked "Process Payroll" |
| created_at | timestamptz | |

### 4.9 `payroll_items` (one row per employee, per payroll run)
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| organization_id | uuid, FK | |
| payroll_id | uuid, FK → payroll | |
| employee_id | uuid, FK | |
| regular_hours | numeric(6,2) | |
| overtime_hours | numeric(6,2) | |
| hourly_rate | numeric(10,2) | snapshot at time of processing |
| overtime_rate | numeric(10,2) | snapshot at time of processing |
| regular_pay | numeric(10,2) | |
| overtime_pay | numeric(10,2) | |
| bonus | numeric(10,2), default 0 | |
| commission | numeric(10,2), default 0 | |
| gross_pay | numeric(10,2) | |
| deductions | numeric(10,2), default 0 | |
| net_pay | numeric(10,2) | |
| pay_stub_pdf_url | text, nullable | link to generated PDF in Supabase Storage |
| created_at | timestamptz | |

### 4.10 `settings` (per-organization attendance rules)
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| organization_id | uuid, FK, unique | one settings row per org |
| grace_period_minutes | integer, default 5 | |
| late_after_minutes | integer, default 5 | |
| overtime_after_hours | numeric(4,2), default 40 | weekly threshold |
| daily_overtime_after_hours | numeric(4,2), nullable | optional daily OT threshold |
| double_time_after_hours | numeric(4,2), nullable | |
| weekend_rate_multiplier | numeric(3,2), default 1.0 | |
| holiday_rate_multiplier | numeric(3,2), default 1.5 | |
| automatic_overtime | boolean, default true | |
| updated_at | timestamptz | |

### 4.11 `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| organization_id | uuid, FK | |
| actor_user_id | uuid, FK → auth.users | who did it |
| action | text | e.g. 'hourly_rate_changed', 'attendance_edited', 'payroll_processed' |
| entity_type | text | e.g. 'employee', 'attendance', 'payroll' |
| entity_id | uuid | |
| before_value | jsonb, nullable | |
| after_value | jsonb, nullable | |
| created_at | timestamptz | |

Every mutating admin action must write a row here. This is not optional.

---

## 5. Row Level Security (RLS) Strategy

For every organization-scoped table:
- Enable RLS
- `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies check that `organization_id` matches an organization the requesting user belongs to (via `memberships`)
- Additionally, for `employees` and `attendance`/`payroll_items`, add a second layer: if the requester's role is `'employee'`, restrict further to rows where `employee_id` matches their own linked employee record (via `employees.user_id = auth.uid()`)
- Admins/owners/managers see all rows within their organization; employees see only their own

Claude Code should implement this as SQL policies using a helper function, e.g. `is_org_member(org_id uuid)` and `is_org_admin(org_id uuid)`, to avoid repeating the same subquery in every policy.

---

## 6. Payroll Processing Logic — CRITICAL, READ CAREFULLY

This is the most important business logic in the system. Get this wrong and customers lose trust immediately (miscalculated pay).

### 6.1 Core rule
**Attendance records are never deleted or reset.** Every attendance record has a `payroll_status` of either `pending` or `processed`. Payroll calculations only ever pull `pending` records within the selected date range. Once processed, a record is permanently linked to a `payroll_id` and excluded from all future payroll runs.

### 6.2 Standard workflow
1. Admin selects one or more employees and a pay period (start date, end date)
2. System queries `attendance` where `employee_id IN (...)`, `payroll_status = 'pending'`, and `clock_in` falls within the pay period
3. System calculates, per employee:
   - Total worked minutes → converted to hours
   - Regular hours vs. overtime hours (based on `settings.overtime_after_hours`, weekly threshold by default)
   - Regular pay = regular hours × hourly_rate
   - Overtime pay = overtime hours × overtime_rate
   - Gross pay = regular pay + overtime pay + bonus + commission
   - Net pay = gross pay − deductions
4. Admin reviews the calculated draft on screen
5. Admin clicks **Process Payroll**, which triggers this transaction:
   - Create one `payroll` row (status = 'processed', processed_at = now())
   - Create one `payroll_items` row per employee with the calculated values
   - Update every included `attendance` row: set `payroll_status = 'processed'` and `payroll_id = <new payroll id>`
   - Write an `audit_logs` entry: action = 'payroll_processed'
   - Generate PDF pay stub(s), store in Supabase Storage, save URL on `payroll_items.pay_stub_pdf_url`

This entire step must run as a single database transaction. If any part fails, nothing should be committed (an employee should never end up half-processed).

### 6.3 Special case: employee is actively clocked in when payroll runs

**This is the trickiest part of the whole system — implement it exactly as follows.**

If, at the moment payroll is processed, an employee has an attendance record with `clock_out = NULL` (an active/open shift), the system must **not** include that open shift as-is, and must **not** force-close it in a way that loses time. Instead, it must **split the shift into two records**.

**Algorithm:**

```
FOR each attendance record where employee_id = X AND clock_out IS NULL:
  IF this record's clock_in falls within the selected pay period:

    processing_timestamp = now()  // the exact moment "Process Payroll" was clicked

    1. UPDATE the existing record:
         clock_out = processing_timestamp
         worked_minutes = calculated from clock_in to processing_timestamp (minus any open break time)
         payroll_status = 'processed'
         payroll_id = <new payroll id>

    2. INSERT a new attendance record:
         employee_id = X
         organization_id = same org
         clock_in = processing_timestamp   // exact same timestamp as the split point, no gap
         clock_out = NULL                  // still actively working
         payroll_status = 'pending'
         payroll_id = NULL
         source = 'system_split'           // mark this as system-generated, not a real punch
         is_manual_entry = false

  This split must happen atomically as part of the same payroll-processing transaction.
```

**Worked example (must match this exactly):**
- Employee clocks in July 15, 8:00 AM
- Admin processes payroll July 15, 2:00 PM (employee still working)
- System creates:
  - Record 1: clock_in 8:00 AM, clock_out 2:00 PM, payroll_status = processed, payroll_id = 125
  - Record 2: clock_in 2:00 PM, clock_out = NULL, payroll_status = pending
- Employee keeps working, unaware anything happened — the "currently clocked in" UI state must remain uninterrupted (query for "is employee currently clocked in" should look at the most recent attendance record per employee regardless of how many times it's been split)
- Employee clocks out at 6:00 PM → Record 2 is updated: clock_out = 6:00 PM, worked_minutes calculated normally
- Those 4 hours (2:00 PM–6:00 PM) are `pending` and will be picked up in the *next* payroll run automatically

**Edge case to handle:** if the employee is on an open break (`breaks.end_time IS NULL`) at the moment of the split, the break should also be closed at the split timestamp on Record 1, and a new open break should NOT automatically start on Record 2 — the employee must explicitly end/resume breaks as normal after the split. (Simplify: force-close the break at split time, log it, and let the employee re-initiate a break if still on one — this avoids ambiguous break state across two attendance records.)

### 6.4 Invariants the system must always maintain
- No attendance record is ever deleted
- No attendance record's worked time is ever reduced to zero or discarded
- An attendance record belongs to at most one `payroll_id`
- Once `payroll_status = 'processed'`, that record is immutable except for corrections that go through an explicit "amend processed payroll" admin flow (out of scope for v1 — flag as future work, do not build silent mutation of processed records)
- Every payroll run has a unique `payroll.id`, and this ID is what's shown to admins as "Payroll ID"

---

## 7. Feature Specifications

### 7.1 Administrator Dashboard
Displays, scoped to the admin's organization:
- Employees currently clocked in (attendance rows where `clock_out IS NULL`)
- Employees absent today (scheduled today per `schedules`, but no attendance record today)
- Total hours worked today (sum of worked_minutes across today's attendance, converted to hours)
- Total payroll this week (sum of gross_pay for payroll_items in current week, if processed; else an estimate from pending attendance × rates)
- Overtime hours (sum of overtime hours this week, calculated live from pending attendance against `settings.overtime_after_hours`)
- Recent clock activities (latest N attendance/break events, live feed)
- Payroll awaiting processing (count/sum of pending attendance grouped by employee, for periods not yet processed)

### 7.2 Employee Management (Admin)
CRUD on `employees`: add, edit, disable (`status = 'disabled'`, cannot clock in), delete (soft-delete recommended — set status = 'terminated' rather than a hard DB delete, to preserve attendance/payroll history integrity). Assign: employee number, department, hourly rate, overtime rate, manager, weekly schedule. Every field change on `employees` must write to `audit_logs`.

### 7.3 Time Clock Management (Admin)
- Live clock status board (all employees currently clocked in, with elapsed time)
- Force clock out (sets `clock_out = now()`, `is_manual_entry` unaffected but should log `edited_by`)
- Correct missed punches / edit worked hours (UPDATE with mandatory `edit_reason`, logged to audit)
- Add manual entries (`is_manual_entry = true`, `source = 'manual_admin'`)
- Approve edits — if you want an approval workflow, add an `approval_status` column to attendance (`'auto_approved'`, `'pending_approval'`, `'approved'`); otherwise treat all admin edits as auto-approved for v1 and flag approval workflow as a v2 feature
- Attendance calendar view (calendar UI, color-coded by status: worked / absent / late / edited)

### 7.4 Reports (Admin)
All reports scoped to `organization_id`, filterable by date range, department, employee.
- Daily Report: first clock-in, last clock-out, break duration, total worked hours, per employee per day
- Weekly / Monthly / Custom Date Range reports: aggregate the daily view
- Department Report: totals grouped by department
- Attendance Report: presence/absence/lateness patterns
- Overtime Report: overtime hours and pay by employee/department
- Payroll Report: from `payroll_items`, filterable by pay period
- **Export formats:** Excel (.xlsx), PDF, CSV — build one shared "report data" query layer, then three export adapters

### 7.5 Payroll Calculator (Admin)
UI flow: select employee(s) → select pay period (start/end date) → system pulls pending attendance and computes draft numbers per Section 6 → admin can add bonus/commission/deductions per employee before finalizing → admin reviews → clicks "Process Payroll" → system executes the transaction in Section 6.2/6.3 → generates pay stub PDF and payroll summary PDF.

### 7.6 Audit Log (Admin)
Read-only, filterable table view of `audit_logs`: actor, action, entity, before/after values, timestamp. Searchable by employee, action type, date range.

### 7.7 Employee Portal Dashboard
- Current status (Clocked In / Clocked Out), large and unambiguous
- Working time today (live-updating if clocked in)
- Hours this week / this pay period
- Upcoming schedule (from `schedules`)
- Recent activity feed (their own attendance/break events only)

### 7.8 Clock In / Clock Out (Employee)
- Large 🟢 Clock In / 🔴 Clock Out buttons, mobile-first design (this is likely used on a phone or shared tablet at a warehouse entrance)
- On clock-in: create new `attendance` row, `clock_in = now()`, `source` depends on method used
- After clocking in: show current time, live worked-time counter, and a Break button
- On clock-out: `UPDATE` current open attendance row, `clock_out = now()`, compute `worked_minutes`

### 7.9 Break Management (Employee)
- Start Break → INSERT `breaks` row linked to current open `attendance_id`, `start_time = now()`
- End Break → UPDATE that row, `end_time = now()`, compute `duration_minutes`, add to `attendance.total_break_minutes`
- Break time is automatically subtracted from worked time when the shift's `worked_minutes` is computed at clock-out (or at payroll split time, per Section 6.3)

### 7.10 Timesheet (Employee)
View own attendance: daily / weekly / monthly / custom range. Shows clock in, clock out, break, worked hours — read-only.

### 7.11 Payroll (Employee view)
- Current pay period: hours worked so far, hourly rate, estimated gross pay (calculated live from pending attendance, clearly labeled "estimate" since it's not yet processed)
- Past paychecks: list of their own `payroll_items`, downloadable PDF pay stubs

### 7.12 Profile (Employee)
Employee can self-update: phone, emergency contact, password. Cannot edit: rate, department, employee number, hire date (admin-only fields).

### 7.13 QR / PIN / RFID / NFC Clock-In
- Each employee has a unique `qr_code_token` — scanning resolves to that employee and prompts clock-in/out
- PIN entry: employee enters `pin_code` (hashed, verified server-side) on a shared kiosk-style screen
- RFID/NFC: architecture should allow a `source` value and an external card/tag ID to resolve to an employee — build the QR/PIN flow first, add RFID/NFC as a pluggable input method later (same underlying clock-in function, different resolution step)

---

## 8. Authentication Notes

- **Admins/managers:** standard Supabase Auth (email + password, or magic link), linked via `memberships`
- **Employees:** two possible access levels —
  - *Kiosk-only employees:* no `auth.users` account, identified purely by PIN/QR/RFID at a shared clock-in station. They never "log in."
  - *Portal employees:* have an `auth.users` account (linked via `employees.user_id`) so they can log into the employee portal from their own phone to view timesheets/pay stubs/profile
- Both can coexist — an employee can clock in via a shared kiosk AND log into their own portal to check pay stubs

---

## 9. Non-Functional Requirements

- **Mobile-first:** the clock-in/out screen and employee portal must be fully usable on a phone screen; admin dashboard can be desktop-optimized but should be responsive
- **Timezone correctness:** store all timestamps in UTC (`timestamptz`), convert to `organizations.timezone` for display and for calculating "daily"/"weekly" boundaries — this matters a lot for overtime calculations
- **Auditability:** every mutating action by an admin is logged (Section 4.11) — no exceptions
- **Data integrity:** attendance records are append-only in spirit — never hard-deleted, corrections are tracked, not overwritten silently
- **Performance:** dashboard queries (currently clocked in, today's totals) should be indexed on `organization_id`, `clock_out` (partial index where NULL), and `clock_in` date

---

## 10. Suggested Build Order (Phased)

1. **Foundation:** Supabase project, full schema + RLS policies from Section 4–5, Supabase Auth, org signup/invite flow
2. **Employee core:** clock in/out (PIN + QR first), breaks, employee timesheet view — this is the highest-visibility feature for customers
3. **Admin core:** employee management, live clock status, admin dashboard
4. **Payroll engine:** Section 6 in full, including the shift-split logic — build and test this in isolation with unit tests before wiring it to the UI, given its complexity
5. **Reporting & exports:** PDF/Excel/CSV, once attendance and payroll data is trustworthy
6. **Billing:** Stripe subscriptions, plan gating, seat counting
7. **RFID/NFC, approval workflows, manager role scoping:** v2 features

---

## 11. Explicit Instructions

- Implement RLS policies for every table before writing any frontend code that queries them — do not rely on frontend filtering for tenant isolation
- Build the payroll shift-split logic (Section 6.3) as a well-tested, isolated database function or server-side function — this is the highest-risk logic in the system and should have unit tests covering: normal processing, processing with an open shift, processing with an open break during an open shift, and processing with zero pending attendance
- Never write a `DELETE` on `attendance` — only `INSERT` and `UPDATE`
- Every schema migration should include the `organization_id` column and its RLS policy in the same migration — don't add tables now and RLS later
- Ask for clarification if a requirement in this document seems to conflict with a request made outside of it, rather than silently choosing one
