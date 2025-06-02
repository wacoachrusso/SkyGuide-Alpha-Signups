import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Recommended to restrict in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Ensure these are set in your Supabase Edge Function environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL')! || 'alpha@skyguide.site'
const SIGNUP_LIMIT = parseInt(Deno.env.get('SIGNUP_LIMIT') || '350', 10)

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const resend = new Resend(RESEND_API_KEY)

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const signupData = await req.json()

    // Validate required fields
    if (!signupData.email || !signupData.first_name || !signupData.last_name || !signupData.airline || !signupData.job_role) {
      return new Response(JSON.stringify({ success: false, error: true, message: 'Missing required fields.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Check signup limit first
    const { count, error: countError } = await supabaseClient
      .from('alpha_signups')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Error counting signups:', countError)
      return new Response(JSON.stringify({ success: false, error: true, message: 'Could not verify signup count.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (count !== null && count >= SIGNUP_LIMIT) {
      return new Response(JSON.stringify({ success: false, error: true, limitReached: true, message: `Sorry, alpha tester sign-ups have reached the limit of ${SIGNUP_LIMIT}.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403, // Forbidden
      })
    }

    // Attempt to insert the new signup
    const { data: insertData, error: insertError } = await supabaseClient
      .from('alpha_signups')
      .insert({
        first_name: signupData.first_name,
        last_name: signupData.last_name,
        email: signupData.email,
        airline: signupData.airline,
        job_role: signupData.job_role,
        agreed_to_terms: signupData.agreed_to_terms,
        // signed_up_at is handled by default value in DB or can be set here
      })
      .select()
      .single() // Expecting a single record back

    if (insertError) {
      console.error('Error inserting signup:', insertError)
      if (insertError.code === '23505') { // Unique violation (email already exists)
        return new Response(JSON.stringify({ success: false, error: true, emailExists: true, message: 'This email address has already been registered.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409, // Conflict
        })
      }
      return new Response(JSON.stringify({ success: false, error: true, message: insertError.message || 'Could not process signup.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Send confirmation email if signup was successful
    if (insertData) {
      const currentYear = new Date().getFullYear();
      const userFirstName = signupData.first_name;
      const logoUrl = 'https://res.cloudinary.com/dcuwsbzv5/image/upload/v1745758949/file_00000000ea2c522f8058dabedafb9d87_conversation_id_67f400ae-b6d8-8009-9c96-ce4f96508a4e_message_id_78191f48-475a-407d-b46a-0037743a80eb_hgcqtw.png';

      const emailHtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SkyGuide Alpha!</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
  </style>
</head>
<body style="margin: 0 !important; padding: 0 !important; background-color: #f0f2f5; font-family: Arial, sans-serif;">
  <div style="display: none; font-size: 1px; color: #f0f2f5; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    Welcome aboard, Alpha Tester! We're excited to have you.
  </div>
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="background-color: #f0f2f5; padding: 20px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; border-spacing: 0; border: 0;">
          <tr>
            <td align="center" style="background-color: #ffffff; padding: 30px 30px 20px 30px; border-radius: 8px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-spacing: 0; border: 0;">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <img src="${logoUrl}" alt="SkyGuide Logo" style="display: block; max-width: 180px; min-width: 100px; width: 100%; height: auto;">
                  </td>
                </tr>
              </table>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-spacing: 0; border: 0;">
                <tr>
                  <td align="left" style="font-family: Arial, sans-serif; font-size: 16px; line-height: 24px; color: #333333; padding-bottom: 20px;">
                    <h1 style="font-size: 24px; font-weight: bold; color: #005A9C; margin: 0 0 15px 0;">Welcome to the SkyGuide Alpha Program!</h1>
                    <p style="margin: 0 0 15px 0;">Hi ${userFirstName},</p>
                    <p style="margin: 0 0 15px 0;">Thank you for signing up for the SkyGuide Alpha Testers program! We're thrilled to have you on board.</p>
                    <p style="margin-top: 20px; margin-bottom: 10px; font-weight: bold;">Your submitted details:</p>
                    <ul style="list-style-type: none; padding-left: 0; margin-bottom: 20px;">
                      ${signupData.airline ? `<li style="margin-bottom: 5px;"><strong>Airline:</strong> ${signupData.airline}</li>` : ''}
                      ${signupData.job_title ? `<li style="margin-bottom: 5px;"><strong>Job Title:</strong> ${signupData.job_title}</li>` : ''}
                    </ul>
                    <p>Your journey to revolutionizing flight operations starts here. We'll be in touch soon with more details and next steps.</p>
                    <p style="margin: 0 0 15px 0;">You're all set for now. We'll be in touch soon with more details and instructions on how to get started.</p>
                    <p style="margin: 0 0 25px 0;">In the meantime, please add <code>${RESEND_FROM_EMAIL}</code> to your email contacts or safe sender list to ensure you receive all our communications.</p>
                    <p style="margin: 0;">Best regards,</p>
                    <p style="margin: 0 0 15px 0;">The SkyGuide Team</p>
                  </td>
                </tr>
              </table>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-spacing: 0; border: 0;">
                <tr>
                  <td align="center" style="font-family: Arial, sans-serif; font-size: 12px; line-height: 18px; color: #777777; padding-top: 20px; border-top: 1px solid #eeeeee;">
                    <p style="margin: 0 0 5px 0;">&copy; ${currentYear} SkyGuide. All rights reserved.</p>
                    <p style="margin: 0;">If you did not sign up for this list, please disregard this email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

      const emailTextContent = `
Hi ${userFirstName},

Welcome to the SkyGuide Alpha Program!

Thank you for signing up to be an Alpha Tester for SkyGuide! We're thrilled to have you on board and appreciate your interest in helping us shape the future of contract navigation for aviation professionals.

You're all set for now. We'll be in touch soon with more details and instructions on how to get started.

In the meantime, please add ${RESEND_FROM_EMAIL} to your email contacts or safe sender list to ensure you receive all our communications.

Best regards,
The SkyGuide Team

© ${currentYear} SkyGuide. All rights reserved.
If you did not sign up for this list, please disregard this email.
      `;

      try {
        await resend.emails.send({
          from: RESEND_FROM_EMAIL,
          to: signupData.email,
          subject: 'Welcome to SkyGuide Alpha! You’re In!',
          html: emailHtmlContent,
          text: emailTextContent,
        });
        console.log(`Confirmation email sent to ${signupData.email}`);
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError.message || emailError);
        // Do not fail the signup if email sending fails, but log the error
      }
    }

    return new Response(JSON.stringify({ success: true, data: insertData, message: 'Signup successful! Please check your email for confirmation.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('General error in Edge Function:', error.message || error);
    return new Response(JSON.stringify({ success: false, error: true, message: error.message || 'An unexpected error occurred.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
