-- Fix security warnings by setting search_path for functions
CREATE OR REPLACE FUNCTION public.notify_responders_on_emergency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reporter_name text;
  supabase_url text := 'https://yzbmqgmaltyuzkblcxlc.supabase.co';
  service_role_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6Ym1xZ21hbHR5dXprYmxjeGxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDk1NzUwMywiZXhwIjoyMDc2NTMzNTAzfQ.EaD1LYBh6lnmfF5iNPqiWwqtvfN2oAC8DqFgYTvPLVk';
BEGIN
  -- Get reporter's name from profiles
  SELECT full_name INTO reporter_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Call the edge function asynchronously using pg_net
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/notify-responders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'emergency_id', NEW.id,
      'emergency_type', NEW.emergency_type,
      'latitude', NEW.latitude,
      'longitude', NEW.longitude,
      'description', NEW.description,
      'reporter_name', COALESCE(reporter_name, 'Unknown')
    )
  );

  RETURN NEW;
END;
$$;

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;