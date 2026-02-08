-- Fix search_path for update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix search_path for handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;