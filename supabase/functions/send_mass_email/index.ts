import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0'

// CORS headers - adjust as needed, though for a manually triggered function, less critical
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or your specific frontend URL if you ever build a UI for this
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') // e.g., 'alpha@skyguide.site' or 'noreply@skyguide.site'
const MASS_EMAIL_SECRET_KEY = Deno.env.get('MASS_EMAIL_SECRET_KEY')

// Initialize Supabase client
let supabaseClient: SupabaseClient
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
} else {
  console.error('Missing Supabase URL or Service Role Key environment variables.')
  // Consider how to handle this critical error - perhaps the function shouldn't even start
}

// Initialize Resend client
let resend: Resend
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY)
} else {
  console.error('Missing Resend API Key environment variable.')
}

const BATCH_SIZE = 500; // Number of emails to send per Resend API call

serve(async (req: Request) => {
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Check for POST method
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  }

  // --- Authorization ---
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !MASS_EMAIL_SECRET_KEY || authHeader !== `Bearer ${MASS_EMAIL_SECRET_KEY}`) {
    console.warn('Unauthorized attempt to send mass email.');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  // --- Ensure clients are initialized ---
  if (!supabaseClient || !resend) {
    console.error('Supabase or Resend client not initialized due to missing environment variables.');
    return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
    });
  }
  if (!RESEND_FROM_EMAIL) {
    console.error('RESEND_FROM_EMAIL environment variable is not set.');
    return new Response(JSON.stringify({ error: 'Server configuration error: Missing sender email.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
    });
  }


  // --- Parse Request Body ---
  let subject: string;
  let html_body: string;
  let text_body: string | undefined;
  let selected_emails: string[];

  try {
    const body = await req.json();
    subject = body.subject;
    html_body = body.html_body;
    text_body = body.text_body; // Optional
    selected_emails = body.selected_emails;

    if (!subject || !html_body) {
      throw new Error('Missing subject or html_body in request.');
    }
    if (!selected_emails || !Array.isArray(selected_emails) || selected_emails.length === 0) {
      throw new Error('Missing or empty selected_emails array in request.');
    }
  } catch (error) {
    console.error('Error parsing request body:', error.message);
    return new Response(JSON.stringify({ error: 'Bad Request: ' + error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const recipientEmails = selected_emails.map(email => String(email).trim()).filter(email => email && email.includes('@'));

  if (recipientEmails.length === 0) {
    console.log('No valid recipient emails provided in selected_emails.');
    return new Response(JSON.stringify({ message: 'No valid recipient emails provided.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400, // Bad request as no valid emails to send to
    });
  }

  console.log(`Mass email requested for ${recipientEmails.length} selected recipients. Subject: "${subject}"`);

  try {

    // --- Prepare Email Content with Template ---
    const logoUrl = 'https://res.cloudinary.com/dcuwsbzv5/image/upload/v1745758949/file_00000000ea2c522f8058dabedafb9d87_conversation_id_67f400ae-b6d8-8009-9c96-ce4f96508a4e_message_id_78191f48-475a-407d-b46a-0037743a80eb_hgcqtw.png';
    const currentYear = new Date().getFullYear();

    // Convert user's plain text (from html_body input) to simple HTML
    let formattedHtmlBodyContent: string;
    if (html_body && html_body.trim() !== '') {
        const escapeHtml = (unsafe: string) => 
            unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

        const escapedText = escapeHtml(html_body); // html_body is the plain text from user

        formattedHtmlBodyContent = escapedText
            .split(/\n\s*\n/) // Split by one or more newlines, possibly with whitespace in between
            .map(paragraph => paragraph.trim()) 
            .filter(paragraph => paragraph.length > 0) 
            .map(paragraph => `<p style="margin: 0 0 15px 0;">${paragraph.replace(/\n/g, '<br>')}</p>`)
            .join('\n');
    } else {
        formattedHtmlBodyContent = '<p style="margin: 0 0 15px 0;">(No message content was provided.)</p>'; 
    }

    const fullHtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #F4F7F9; font-family: Arial, sans-serif; }
    .webkit { max-width: 600px; margin: 0 auto; } 
  </style>
</head>
<body style="margin: 0 !important; padding: 0 !important; background-color: #f0f2f5; font-family: Arial, sans-serif;">
  <div style="display: none; font-size: 1px; color: #f0f2f5; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    An update from the SkyGuide Alpha Team!
  </div>
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="background-color: #f0f2f5; padding: 20px;">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <div class="webkit">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; border-top: 5px solid #003366;">
            <tr>
              <td align="center" style="padding: 30px 30px 20px 30px;">
                <img src="${logoUrl}" alt="SkyGuide Logo" style="display: block; max-width: 180px; min-width: 100px; width: 100%; height: auto;">
              </td>
            </tr>
            <tr>
              <td align="left" style="padding: 0px 30px 30px 30px; font-family: Arial, sans-serif; font-size: 16px; line-height: 24px; color: #333333;">
                ${formattedHtmlBodyContent} 
                <p style="margin: 20px 0 15px 0;">
                  Best regards,<br>
                  The SkyGuide Team
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 20px 30px; background-color: #EAEAEA; font-family: Arial, sans-serif; font-size: 12px; line-height: 18px; color: #555555;">
                <p style="margin: 0 0 5px 0;">&copy; ${currentYear} SkyGuide. All rights reserved.</p>
                <p style="margin: 0;">SkyGuide Alpha Program</p>
              </td>
            </tr>
          </table>
        </div>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
  `;

    // Use original html_body (which is plain text from user) for text version if text_body is not supplied by user.
    const plainTextMessageForTextPart = text_body || html_body || "(No message content was provided.)"; 

    // --- Send Emails in Batches ---
    let allSentSuccessfully = true;
    let errorsEncountered: string[] = [];

    for (let i = 0; i < recipientEmails.length; i += BATCH_SIZE) {
      const batch = recipientEmails.slice(i, i + BATCH_SIZE);
      console.log(`Sending batch of ${batch.length} emails...`);

      try {
        const { data, error: resendError } = await resend.emails.send({
          from: RESEND_FROM_EMAIL,
          to: batch, // Resend can handle an array of recipients for 'to'
          subject: subject,
          html: fullHtmlContent,
          text: plainTextMessageForTextPart, 
        });

        if (resendError) {
          console.error('Error sending email batch via Resend:', resendError);
          allSentSuccessfully = false;
          errorsEncountered.push(`Batch starting with ${batch[0]}: ${resendError.message}`);
        } else {
          console.log('Email batch sent successfully via Resend:', data);
        }
      } catch (batchError) {
        console.error('Critical error during batch email sending:', batchError);
        allSentSuccessfully = false;
        errorsEncountered.push(`Batch starting with ${batch[0]}: ${batchError.message}`);
      }
    }

    if (!allSentSuccessfully) {
      console.warn('Some email batches failed to send. Errors:', errorsEncountered);
      return new Response(JSON.stringify({ 
        message: 'Some emails may not have been sent. Check server logs.', 
        errors: errorsEncountered 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 207, // Multi-Status, as some might have succeeded
      });
    }

    console.log('All selected emails processed successfully.');
    return new Response(JSON.stringify({ message: 'All selected emails processed successfully!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Unexpected error in send_mass_email function:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error: ' + error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
