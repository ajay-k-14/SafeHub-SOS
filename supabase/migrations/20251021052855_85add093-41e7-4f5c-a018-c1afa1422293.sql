-- Create a function to notify responders about new emergencies
CREATE OR REPLACE FUNCTION notify_responders_on_emergency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create trigger on emergency_reports table
DROP TRIGGER IF EXISTS on_emergency_report_created ON public.emergency_reports;

CREATE TRIGGER on_emergency_report_created
  AFTER INSERT ON public.emergency_reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_responders_on_emergency();

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;