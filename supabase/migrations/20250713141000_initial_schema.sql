-- Emporio Time & Payroll Management System
-- Initial schema: tables, indexes, RLS helper functions, and policies

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Generic trigger helpers (no table dependencies)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.1 organizations
-- ---------------------------------------------------------------------------

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  industry text,
  subscription_status text NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
  subscription_plan text,
  stripe_customer_id text,
  stripe_subscription_id text,
  seat_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4.2 memberships
-- ---------------------------------------------------------------------------

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'employee')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

CREATE INDEX idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX idx_memberships_organization_id ON public.memberships(organization_id);

-- ---------------------------------------------------------------------------
-- 4.3 departments (manager FK added after employees table)
-- ---------------------------------------------------------------------------

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  manager_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_departments_organization_id ON public.departments(organization_id);

-- ---------------------------------------------------------------------------
-- 4.4 employees
-- ---------------------------------------------------------------------------

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  position text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  manager_id uuid,
  hourly_rate numeric(10, 2) NOT NULL DEFAULT 0,
  overtime_rate numeric(10, 2) NOT NULL DEFAULT 0,
  hire_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'terminated')),
  pin_code text,
  qr_code_token text UNIQUE,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_number)
);

CREATE INDEX idx_employees_organization_id ON public.employees(organization_id);
CREATE INDEX idx_employees_user_id ON public.employees(user_id);
CREATE INDEX idx_employees_department_id ON public.employees(department_id);
CREATE INDEX idx_employees_status ON public.employees(organization_id, status);

ALTER TABLE public.employees
  ADD CONSTRAINT employees_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.departments
  ADD CONSTRAINT departments_manager_employee_id_fkey
  FOREIGN KEY (manager_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE TRIGGER employees_set_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.5 schedules
-- ---------------------------------------------------------------------------

CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, day_of_week)
);

CREATE INDEX idx_schedules_organization_id ON public.schedules(organization_id);
CREATE INDEX idx_schedules_employee_id ON public.schedules(employee_id);

-- ---------------------------------------------------------------------------
-- 4.8 payroll (created before attendance due to FK from attendance)
-- ---------------------------------------------------------------------------

CREATE TABLE public.payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processed')),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pay_period_end >= pay_period_start)
);

CREATE INDEX idx_payroll_organization_id ON public.payroll(organization_id);
CREATE INDEX idx_payroll_period ON public.payroll(organization_id, pay_period_start, pay_period_end);

-- ---------------------------------------------------------------------------
-- 4.6 attendance
-- ---------------------------------------------------------------------------

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  total_break_minutes integer NOT NULL DEFAULT 0,
  worked_minutes integer,
  payroll_status text NOT NULL DEFAULT 'pending'
    CHECK (payroll_status IN ('pending', 'processed')),
  payroll_id uuid REFERENCES public.payroll(id) ON DELETE SET NULL,
  source text NOT NULL
    CHECK (source IN ('qr', 'pin', 'rfid', 'nfc', 'manual_admin', 'system_split')),
  is_manual_entry boolean NOT NULL DEFAULT false,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edit_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (payroll_status = 'processed' AND payroll_id IS NOT NULL)
    OR (payroll_status = 'pending' AND payroll_id IS NULL)
  )
);

CREATE INDEX idx_attendance_organization_id ON public.attendance(organization_id);
CREATE INDEX idx_attendance_employee_id ON public.attendance(employee_id);
CREATE INDEX idx_attendance_clock_in ON public.attendance(organization_id, clock_in);
CREATE INDEX idx_attendance_payroll_status ON public.attendance(organization_id, payroll_status);
CREATE INDEX idx_attendance_open_shifts ON public.attendance(organization_id, employee_id)
  WHERE clock_out IS NULL;
CREATE INDEX idx_attendance_pending ON public.attendance(organization_id, employee_id, clock_in)
  WHERE payroll_status = 'pending';

CREATE TRIGGER attendance_set_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.7 breaks
-- ---------------------------------------------------------------------------

CREATE TABLE public.breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_breaks_organization_id ON public.breaks(organization_id);
CREATE INDEX idx_breaks_attendance_id ON public.breaks(attendance_id);
CREATE INDEX idx_breaks_open ON public.breaks(attendance_id)
  WHERE end_time IS NULL;

-- ---------------------------------------------------------------------------
-- 4.9 payroll_items
-- ---------------------------------------------------------------------------

CREATE TABLE public.payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_id uuid NOT NULL REFERENCES public.payroll(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  regular_hours numeric(6, 2) NOT NULL DEFAULT 0,
  overtime_hours numeric(6, 2) NOT NULL DEFAULT 0,
  hourly_rate numeric(10, 2) NOT NULL DEFAULT 0,
  overtime_rate numeric(10, 2) NOT NULL DEFAULT 0,
  regular_pay numeric(10, 2) NOT NULL DEFAULT 0,
  overtime_pay numeric(10, 2) NOT NULL DEFAULT 0,
  bonus numeric(10, 2) NOT NULL DEFAULT 0,
  commission numeric(10, 2) NOT NULL DEFAULT 0,
  gross_pay numeric(10, 2) NOT NULL DEFAULT 0,
  deductions numeric(10, 2) NOT NULL DEFAULT 0,
  net_pay numeric(10, 2) NOT NULL DEFAULT 0,
  pay_stub_pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_id, employee_id)
);

CREATE INDEX idx_payroll_items_organization_id ON public.payroll_items(organization_id);
CREATE INDEX idx_payroll_items_payroll_id ON public.payroll_items(payroll_id);
CREATE INDEX idx_payroll_items_employee_id ON public.payroll_items(employee_id);

-- ---------------------------------------------------------------------------
-- 4.10 settings
-- ---------------------------------------------------------------------------

CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  grace_period_minutes integer NOT NULL DEFAULT 5,
  late_after_minutes integer NOT NULL DEFAULT 5,
  overtime_after_hours numeric(4, 2) NOT NULL DEFAULT 40,
  daily_overtime_after_hours numeric(4, 2),
  double_time_after_hours numeric(4, 2),
  weekend_rate_multiplier numeric(3, 2) NOT NULL DEFAULT 1.0,
  holiday_rate_multiplier numeric(3, 2) NOT NULL DEFAULT 1.5,
  automatic_overtime boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER settings_set_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.11 audit_logs
-- ---------------------------------------------------------------------------

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_organization_id ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(organization_id, entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(organization_id, action);

-- ---------------------------------------------------------------------------
-- RLS helper functions (require memberships + employees tables)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role IN ('owner', 'admin', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_employee_id_for_user(org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.user_id = auth.uid()
    AND e.organization_id = org_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_access_employee(org_id uuid, emp_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_org_admin(org_id)
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = emp_id
        AND e.organization_id = org_id
        AND e.user_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select_member"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY "organizations_insert_authenticated"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "organizations_update_admin"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memberships_select_own_or_admin"
  ON public.memberships FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin(organization_id)
  );

CREATE POLICY "memberships_insert_self_owner_or_admin"
  ON public.memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_org_admin(organization_id)
  );

CREATE POLICY "memberships_update_admin"
  ON public.memberships FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "memberships_delete_admin"
  ON public.memberships FOR DELETE
  TO authenticated
  USING (public.is_org_admin(organization_id));

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_member"
  ON public.departments FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "departments_insert_admin"
  ON public.departments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "departments_update_admin"
  ON public.departments FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "departments_delete_admin"
  ON public.departments FOR DELETE
  TO authenticated
  USING (public.is_org_admin(organization_id));

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select_scoped"
  ON public.employees FOR SELECT
  TO authenticated
  USING (public.can_access_employee(organization_id, id));

CREATE POLICY "employees_insert_admin"
  ON public.employees FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "employees_update_admin_or_self_profile"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR user_id = auth.uid()
  );

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_select_scoped"
  ON public.schedules FOR SELECT
  TO authenticated
  USING (public.can_access_employee(organization_id, employee_id));

CREATE POLICY "schedules_insert_admin"
  ON public.schedules FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "schedules_update_admin"
  ON public.schedules FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "schedules_delete_admin"
  ON public.schedules FOR DELETE
  TO authenticated
  USING (public.is_org_admin(organization_id));

ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_select_admin"
  ON public.payroll FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "payroll_insert_admin"
  ON public.payroll FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "payroll_update_admin"
  ON public.payroll FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_select_scoped"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (public.can_access_employee(organization_id, employee_id));

CREATE POLICY "attendance_insert_scoped"
  ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR employee_id = public.get_employee_id_for_user(organization_id)
  );

CREATE POLICY "attendance_update_scoped"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR employee_id = public.get_employee_id_for_user(organization_id)
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR employee_id = public.get_employee_id_for_user(organization_id)
  );

-- Attendance records are never deleted (spec Section 6.4)

ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "breaks_select_scoped"
  ON public.breaks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance a
      WHERE a.id = attendance_id
        AND public.can_access_employee(a.organization_id, a.employee_id)
    )
  );

CREATE POLICY "breaks_insert_scoped"
  ON public.breaks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.attendance a
      WHERE a.id = attendance_id
        AND (
          public.is_org_admin(a.organization_id)
          OR a.employee_id = public.get_employee_id_for_user(a.organization_id)
        )
    )
  );

CREATE POLICY "breaks_update_scoped"
  ON public.breaks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance a
      WHERE a.id = attendance_id
        AND (
          public.is_org_admin(a.organization_id)
          OR a.employee_id = public.get_employee_id_for_user(a.organization_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.attendance a
      WHERE a.id = attendance_id
        AND (
          public.is_org_admin(a.organization_id)
          OR a.employee_id = public.get_employee_id_for_user(a.organization_id)
        )
    )
  );

ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_items_select_scoped"
  ON public.payroll_items FOR SELECT
  TO authenticated
  USING (public.can_access_employee(organization_id, employee_id));

CREATE POLICY "payroll_items_insert_admin"
  ON public.payroll_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "payroll_items_update_admin"
  ON public.payroll_items FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_member"
  ON public.settings FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "settings_insert_admin"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "settings_update_admin"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_admin"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "audit_logs_insert_authenticated"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND actor_user_id = auth.uid()
  );

-- Audit logs are append-only; no UPDATE or DELETE policies

-- ---------------------------------------------------------------------------
-- Business logic triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.settings (organization_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

CREATE OR REPLACE FUNCTION public.compute_attendance_worked_minutes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL THEN
    NEW.worked_minutes := GREATEST(
      0,
      EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in))::integer / 60
        - COALESCE(NEW.total_break_minutes, 0)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_compute_worked_minutes
  BEFORE INSERT OR UPDATE OF clock_out, clock_in, total_break_minutes ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.compute_attendance_worked_minutes();

CREATE OR REPLACE FUNCTION public.compute_break_duration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.end_time IS NOT NULL THEN
    NEW.duration_minutes := GREATEST(
      0,
      EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::integer / 60
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER breaks_compute_duration
  BEFORE INSERT OR UPDATE OF end_time, start_time ON public.breaks
  FOR EACH ROW EXECUTE FUNCTION public.compute_break_duration();

CREATE OR REPLACE FUNCTION public.sync_attendance_break_minutes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_attendance_id uuid;
BEGIN
  target_attendance_id := COALESCE(NEW.attendance_id, OLD.attendance_id);

  UPDATE public.attendance
  SET total_break_minutes = COALESCE((
    SELECT SUM(duration_minutes)
    FROM public.breaks
    WHERE attendance_id = target_attendance_id
      AND duration_minutes IS NOT NULL
  ), 0)
  WHERE id = target_attendance_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER breaks_sync_attendance_total
  AFTER INSERT OR UPDATE OF duration_minutes, end_time OR DELETE ON public.breaks
  FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_break_minutes();
