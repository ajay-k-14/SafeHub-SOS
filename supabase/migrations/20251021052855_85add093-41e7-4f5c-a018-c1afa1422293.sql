-- Create a function to notify responders about new emergencies
CREATE OR REPLACE FUNCTION notify_responders_on_emergency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create trigger on emergency_reports table
DROP TRIGGER IF EXISTS on_emergency_report_created ON public.emergency_reports;

CREATE TRIGGER on_emergency_report_created
  AFTER INSERT ON public.emergency_reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_responders_on_emergency();

-- Ensure extensions schema exists then enable pg_net extension
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA public;
