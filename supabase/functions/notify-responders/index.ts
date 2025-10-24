import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmergencyNotification {
  emergency_id: string;
  emergency_type: string;
  latitude: number;
  longitude: number;
  description?: string;
  reporter_name?: string;
}

interface ResendClient {
  emails: {
    send(payload: { from: string; to: string[]; subject: string; html: string }): Promise<unknown>;
  };
}

const validateEnv = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!resendKey) missing.push("RESEND_API_KEY");

  return { url, key, resendKey, missing };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, key, resendKey, missing } = validateEnv();
    if (missing.length > 0) {
      console.error("Missing env vars:", missing);
      return new Response(
        JSON.stringify({ error: `Missing env vars: ${missing.join(", ")}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseClient: SupabaseClient = createClient(url!, key!);

    // Import Resend dynamically so missing key won't crash module load
  let resend: ResendClient | null = null;
    try {
      const mod = await import("https://esm.sh/resend@2.0.0");
      resend = new mod.Resend(resendKey);
    } catch (e) {
      console.warn("Resend import/init failed:", e);
      // Continue; we'll error if we attempt to send emails
    }

    const payload: EmergencyNotification = await req.json();
    const { emergency_id, emergency_type, latitude, longitude, description, reporter_name } = payload;

    console.log("Processing emergency notification:", emergency_id);

    // Get all users with responder or admin roles
    const { data: responderRoles, error: rolesError } = await supabaseClient
      .from("user_roles")
      .select("user_id")
      .in("role", ["responder", "admin"]);

    if (rolesError) {
      console.error("Error fetching responder roles:", rolesError);
      throw rolesError;
    }

    if (!responderRoles || responderRoles.length === 0) {
      console.log("No responders found to notify");
      return new Response(
        JSON.stringify({ message: "No responders to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get email addresses for these users
  const userIds = (responderRoles as Array<Record<string, unknown>>).map((r) => (r as any).user_id);
    const { data: authUsers, error: authError } = await supabaseClient.auth.admin.listUsers();

    if (authError) {
      console.error("Error fetching users:", authError);
      throw authError;
    }

    const responderEmails = (authUsers.users || [])
      .filter((user: unknown) => userIds.includes((user as any).id))
      .map((user: unknown) => (user as any).email)
      .filter(Boolean) as string[];

    if (responderEmails.length === 0) {
      console.log("No responder emails found");
      return new Response(
        JSON.stringify({ message: "No responder emails found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending notifications to ${responderEmails.length} responders`);

    const emergencyTypeDisplay = emergency_type.replace('_', ' ').toUpperCase();
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    if (!resend) {
      console.error("Resend client not initialized; emails will not be sent");
      return new Response(
        JSON.stringify({ error: 'Email provider not configured' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send emails to all responders
    const emailPromises = responderEmails.map((email: string) =>
      resend.emails.send({
        from: "Emergency Alert <onboarding@resend.dev>",
        to: [email],
        subject: `🚨 NEW EMERGENCY: ${emergencyTypeDisplay}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 28px;">🚨 EMERGENCY ALERT</h1>
            </div>
            
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
              <div style="background: white; padding: 25px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="color: #dc2626; margin-top: 0; font-size: 24px;">${emergencyTypeDisplay} Emergency</h2>
                
                ${description ? `<p style="color: #374151; font-size: 16px; line-height: 1.6;"><strong>Description:</strong> ${description}</p>` : ''}
                
                ${reporter_name ? `<p style="color: #374151; font-size: 16px;"><strong>Reporter:</strong> ${reporter_name}</p>` : ''}
                
                <p style="color: #374151; font-size: 16px;"><strong>Location:</strong> ${latitude.toFixed(4)}, ${longitude.toFixed(4)}</p>
                
                <div style="margin: 25px 0;">
                  <a href="${mapsUrl}" 
                     style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    📍 View Location on Map
                  </a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  Please respond immediately through the <strong>Emergency Response Dashboard</strong>
                </p>
              </div>
            </div>
          </div>
        `,
      })
    );

    const results = await Promise.allSettled(emailPromises);
  const successful = results.filter((r: unknown) => (r as any).status === 'fulfilled').length;
  const failed = results.filter((r: unknown) => (r as any).status === 'rejected').length;

    console.log(`Emails sent: ${successful} successful, ${failed} failed`);

    return new Response(
      JSON.stringify({ 
        message: "Notifications sent", 
        successful, 
        failed,
        total: responderEmails.length 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    console.error("Error in notify-responders function:", error);
    return new Response(
      JSON.stringify({ error: (error as any)?.message || String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
