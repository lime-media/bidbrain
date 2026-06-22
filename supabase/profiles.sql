-- Run this in your Supabase dashboard → SQL Editor

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Enable RLS so users can only read their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- 3. Auto-create a profile (is_admin = false) whenever a new user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, is_admin)
  VALUES (new.id, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Create a profile for any existing users (they didn't get one from the trigger)
INSERT INTO public.profiles (id, is_admin)
SELECT id, false FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 5. Make YOUR account an admin (run this after the above)
-- Replace the email below with your own email address
UPDATE public.profiles
SET is_admin = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'schaudhari@lime-media.com');
