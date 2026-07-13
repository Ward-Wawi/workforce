-- Phase 1: invite flow + team member listing RPCs

CREATE OR REPLACE FUNCTION public.invite_to_organization(
  p_organization_id uuid,
  p_email text,
  p_role text DEFAULT 'employee'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_membership_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized to invite users to this organization';
  END IF;

  IF p_role NOT IN ('admin', 'manager', 'employee') THEN
    RAISE EXCEPTION 'Invalid role. Owners must be assigned during organization creation.';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account found for that email. Ask them to sign up first, then invite again.';
  END IF;

  INSERT INTO public.memberships (user_id, organization_id, role)
  VALUES (v_user_id, p_organization_id, p_role)
  ON CONFLICT (user_id, organization_id)
  DO UPDATE SET role = EXCLUDED.role
  RETURNING id INTO v_membership_id;

  RETURN v_membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_members(p_organization_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized to view organization members';
  END IF;

  RETURN QUERY
  SELECT
    m.id AS membership_id,
    m.user_id,
    u.email::text,
    m.role,
    m.created_at AS joined_at
  FROM public.memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_organization_id
  ORDER BY m.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_to_organization(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_members(uuid) TO authenticated;
