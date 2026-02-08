-- Enums
CREATE TYPE public.app_role AS ENUM ('employee', 'manager', 'admin');
CREATE TYPE public.expense_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'paid');
CREATE TYPE public.report_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'paid');
CREATE TYPE public.payment_method AS ENUM ('personal_card', 'corporate_card', 'cash', 'other');
CREATE TYPE public.approval_decision AS ENUM ('approved', 'rejected');

-- Organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name TEXT,
  avatar_url TEXT,
  currency TEXT DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'employee',
  UNIQUE (user_id, role)
);

-- Expense categories table
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expenses table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT DEFAULT 'BRL',
  payment_method payment_method NOT NULL DEFAULT 'personal_card',
  is_reimbursable BOOLEAN NOT NULL DEFAULT true,
  status expense_status NOT NULL DEFAULT 'draft',
  receipt_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status report_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Report items (expenses in a report)
CREATE TABLE public.report_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE NOT NULL,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, expense_id)
);

-- Report approvals
CREATE TABLE public.report_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE NOT NULL,
  approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decision approval_decision NOT NULL,
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_approvals ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user's org_id
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = _user_id
$$;

-- Function to check if user is manager or admin
CREATE OR REPLACE FUNCTION public.is_manager_or_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('manager', 'admin')
  )
$$;

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies

-- Organizations: users can only see their own org
CREATE POLICY "Users can view their organization"
ON public.organizations FOR SELECT
TO authenticated
USING (id = public.get_user_org_id(auth.uid()));

-- Profiles: users can view and update their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Managers/admins can view profiles in their org
CREATE POLICY "Managers can view org profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin(auth.uid()) 
  AND org_id = public.get_user_org_id(auth.uid())
);

-- User roles policies
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own role"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Expense categories: users can view categories from their org
CREATE POLICY "Users can view org categories"
ON public.expense_categories FOR SELECT
TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage org categories"
ON public.expense_categories FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  AND org_id = public.get_user_org_id(auth.uid())
);

-- Expenses policies
CREATE POLICY "Users can view own expenses"
ON public.expenses FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Managers can view org expenses"
ON public.expenses FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin(auth.uid()) 
  AND org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "Users can insert own expenses"
ON public.expenses FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "Users can update own draft expenses"
ON public.expenses FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() 
  AND status = 'draft'
);

CREATE POLICY "Managers can update org expenses status"
ON public.expenses FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_admin(auth.uid()) 
  AND org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "Users can delete own draft expenses"
ON public.expenses FOR DELETE
TO authenticated
USING (
  user_id = auth.uid() 
  AND status = 'draft'
);

-- Reports policies
CREATE POLICY "Users can view own reports"
ON public.reports FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Managers can view org reports"
ON public.reports FOR SELECT
TO authenticated
USING (
  public.is_manager_or_admin(auth.uid()) 
  AND org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "Users can insert own reports"
ON public.reports FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "Users can update own draft reports"
ON public.reports FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() 
  AND status = 'draft'
);

CREATE POLICY "Managers can update org reports"
ON public.reports FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_admin(auth.uid()) 
  AND org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "Users can delete own draft reports"
ON public.reports FOR DELETE
TO authenticated
USING (
  user_id = auth.uid() 
  AND status = 'draft'
);

-- Report items policies
CREATE POLICY "Users can view report items for their reports"
ON public.report_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reports r 
    WHERE r.id = report_id 
    AND (r.user_id = auth.uid() OR (
      public.is_manager_or_admin(auth.uid()) 
      AND r.org_id = public.get_user_org_id(auth.uid())
    ))
  )
);

CREATE POLICY "Users can insert items to own draft reports"
ON public.report_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reports r 
    WHERE r.id = report_id 
    AND r.user_id = auth.uid() 
    AND r.status = 'draft'
  )
);

CREATE POLICY "Users can delete items from own draft reports"
ON public.report_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reports r 
    WHERE r.id = report_id 
    AND r.user_id = auth.uid() 
    AND r.status = 'draft'
  )
);

-- Report approvals policies
CREATE POLICY "Users can view approvals for their reports"
ON public.report_approvals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reports r 
    WHERE r.id = report_id 
    AND (r.user_id = auth.uid() OR public.is_manager_or_admin(auth.uid()))
  )
);

CREATE POLICY "Managers can insert approvals"
ON public.report_approvals FOR INSERT
TO authenticated
WITH CHECK (
  public.is_manager_or_admin(auth.uid()) 
  AND approver_id = auth.uid()
);

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', false);

-- Storage policies
CREATE POLICY "Users can upload receipts to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = public.get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can view their own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = public.get_user_org_id(auth.uid())::text
  AND (
    (storage.foldername(name))[2] = auth.uid()::text
    OR public.is_manager_or_admin(auth.uid())
  )
);

CREATE POLICY "Users can delete their own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] = public.get_user_org_id(auth.uid())::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Function to handle new user signup - creates profile and default org if needed
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _org_id UUID;
BEGIN
  -- Create a default organization for the user
  INSERT INTO public.organizations (name) 
  VALUES ('Minha Empresa')
  RETURNING id INTO _org_id;
  
  -- Create the user profile
  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (NEW.id, _org_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  -- Assign admin role to the first user of the org
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');
  
  -- Create default expense categories
  INSERT INTO public.expense_categories (org_id, name) VALUES
    (_org_id, 'Alimentação'),
    (_org_id, 'Transporte'),
    (_org_id, 'Hospedagem'),
    (_org_id, 'Outros');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();