import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifyContactsRequest {
  emergency_id: string;
  emergency_type: string;
  latitude: number;
  longitude: number;
  description: string;
  user_id: string;
  reporter_name: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    const payload: NotifyContactsRequest = await req.json();
    console.log('Received emergency notification:', payload);

    // Fetch user's emergency contacts
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', payload.user_id);

    if (contactsError) {
      console.error('Error fetching contacts:', contactsError);
      throw contactsError;
    }

    if (!contacts || contacts.length === 0) {
      console.log('No contacts found for user');
      return new Response(
        JSON.stringify({ message: 'No contacts to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${contacts.length} contacts to notify`);

    const locationUrl = `https://maps.google.com/?q=${payload.latitude},${payload.longitude}`;
    
    const messageBody = `🚨 Emergency Alert from ${payload.reporter_name}!
Type: ${payload.emergency_type}
Location: ${locationUrl}
${payload.description ? `Message: ${payload.description}` : ''}
Please reach out or respond immediately.`;

    const emailHtml = `
      <h1>🚨 Emergency Alert</h1>
      <p><strong>${payload.reporter_name}</strong> has sent an emergency alert!</p>
      <p><strong>Type:</strong> ${payload.emergency_type}</p>
      <p><strong>Location:</strong> <a href="${locationUrl}">${locationUrl}</a></p>
      ${payload.description ? `<p><strong>Message:</strong> ${payload.description}</p>` : ''}
      <p style="color: red; font-weight: bold;">Please reach out or respond immediately.</p>
    `;

    let emailsSent = 0;
    let smsSent = 0;
    const failures: string[] = [];

    // Send emails and SMS to all contacts
    for (const contact of contacts as Contact[]) {
      // Send Email
      try {
        await resend.emails.send({
          from: 'Emergency Alert <onboarding@resend.dev>',
          to: [contact.email],
          subject: `🚨 Emergency Alert from ${payload.reporter_name}`,
          html: emailHtml,
        });
        emailsSent++;
        console.log(`Email sent to ${contact.email}`);
      } catch (emailError) {
        console.error(`Failed to send email to ${contact.email}:`, emailError);
        failures.push(`Email to ${contact.name}`);
      }

      // Send SMS via Twilio
      try {
        const smsResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: contact.phone,
              From: twilioPhoneNumber,
              Body: messageBody,
            }),
          }
        );

        if (smsResponse.ok) {
          smsSent++;
          console.log(`SMS sent to ${contact.phone}`);
        } else {
          const errorData = await smsResponse.text();
          console.error(`Failed to send SMS to ${contact.phone}:`, errorData);
          failures.push(`SMS to ${contact.name}`);
        }
      } catch (smsError) {
        console.error(`Failed to send SMS to ${contact.phone}:`, smsError);
        failures.push(`SMS to ${contact.name}`);
      }
    }

    console.log(`Notification complete: ${emailsSent} emails, ${smsSent} SMS sent`);

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent,
        smsSent,
        totalContacts: contacts.length,
        failures: failures.length > 0 ? failures : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in notify-contacts function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
