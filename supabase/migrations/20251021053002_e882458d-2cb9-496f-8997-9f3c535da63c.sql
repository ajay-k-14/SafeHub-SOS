-- Fix security warnings by setting search_path for functions
CREATE OR REPLACE FUNCTION public.notify_responders_on_emergency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reporter_name text;
  supabase_url text := 'https://ezmigqojzpjscpvcazsk.supabase.co';
BEGIN
  -- Get reporter's name from profiles
  SELECT full_name INTO reporter_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Call the edge function asynchronously using pg_net
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/notify-responders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
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

-- Ensure net schema exists and install pg_net into it so functions like net.http_post are available
CREATE SCHEMA IF NOT EXISTS net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA net;