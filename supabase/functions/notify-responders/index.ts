import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { emergency_id, emergency_type, latitude, longitude, description, reporter_name }: EmergencyNotification = await req.json();

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
    const userIds = responderRoles.map(r => r.user_id);
    const { data: authUsers, error: authError } = await supabaseClient.auth.admin.listUsers();

    if (authError) {
      console.error("Error fetching users:", authError);
      throw authError;
    }

    const responderEmails = authUsers.users
      .filter(user => userIds.includes(user.id))
      .map(user => user.email)
      .filter(email => email);

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

    // Send emails to all responders
    const emailPromises = responderEmails.map(email =>
      resend.emails.send({
        from: "Emergency Alert <onboarding@resend.dev>",
        to: [email!],
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
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

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
  } catch (error: any) {
    console.error("Error in notify-responders function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
