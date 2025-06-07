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

  try {
    const body = await req.json()
    subject = body.subject
    html_body = body.html_body
    text_body = body.text_body // Optional

    if (!subject || !html_body) {
      throw new Error('Missing subject or html_body in request.')
    }
  } catch (error) {
    console.error('Error parsing request body:', error.message)
    return new Response(JSON.stringify({ error: 'Bad Request: ' + error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  console.log(`Mass email requested. Subject: "${subject}"`);

  try {
    // --- Fetch Recipients ---
    const { data: users, error: fetchError } = await supabaseClient
      .from('alpha_signups')
      .select('email')
      // .eq('is_subscribed', true) // Optional: if you add an unsubscribe flag

    if (fetchError) {
      console.error('Error fetching users:', fetchError)
      return new Response(JSON.stringify({ error: 'Failed to fetch recipients.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (!users || users.length === 0) {
      console.log('No users found to send email to.');
      return new Response(JSON.stringify({ message: 'No recipients found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const recipientEmails = users.map(user => user.email).filter(email => email); // Ensure emails are valid strings
    console.log(`Found ${recipientEmails.length} recipients.`);

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
    const finalTextBody = `${subject}\n\n${plainTextMessageForTextPart}\n\nBest regards,\nThe SkyGuide Team\n\n© ${currentYear} SkyGuide. All rights reserved.`;

    // --- Batch Sending ---
    let successfulSends = 0;
    let failedSends = 0;
    const totalBatches = Math.ceil(recipientEmails.length / BATCH_SIZE);
    let currentBatch = 0;

    for (let i = 0; i < recipientEmails.length; i += BATCH_SIZE) {
      currentBatch++;
      const batch = recipientEmails.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${currentBatch}/${totalBatches} with ${batch.length} emails.`);
      
      try {
        const { data, error } = await resend.emails.send({
          from: RESEND_FROM_EMAIL,
          to: batch, // Resend accepts an array for 'to' for batch sending
          subject: subject,
          html: fullHtmlContent,
          text: finalTextBody,
        });

        if (error) {
          console.error(`Error sending batch ${currentBatch}:`, error);
          failedSends += batch.length; // Assume all in batch failed if error object is present
        } else {
          console.log(`Successfully sent batch ${currentBatch}. ID: ${data?.id}`);
          successfulSends += batch.length;
        }
      } catch (batchError) {
        console.error(`Exception sending batch ${currentBatch}:`, batchError);
        failedSends += batch.length;
      }
      // Optional: Add a small delay between batches if concerned about rate limits, though Resend handles this well.
      // await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
    }

    console.log(`Mass email process complete. Successful: ${successfulSends}, Failed: ${failedSends}`);
    return new Response(JSON.stringify({ 
        message: 'Mass email processing finished.', 
        successful_sends: successfulSends,
        failed_sends: failedSends,
        total_recipients_processed: recipientEmails.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (e) {
    console.error('Unexpected error in mass email function:', e)
    return new Response(JSON.stringify({ error: 'Internal Server Error: ' + e.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
