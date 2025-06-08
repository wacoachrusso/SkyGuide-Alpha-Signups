import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@3.2.0'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Adjust as needed for security
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL')
const MASS_EMAIL_SECRET_KEY = Deno.env.get('MASS_EMAIL_SECRET_KEY')

if (!MASS_EMAIL_SECRET_KEY) {
  console.warn('MASS_EMAIL_SECRET_KEY is not set. Mass email requests will always be rejected.')
}

// Initialize Supabase client
let supabaseClient: SupabaseClient | undefined;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  } catch (e: any) {
    console.error("Error initializing Supabase client:", e.message);
  }
} else {
  console.warn('Missing Supabase URL or Service Role Key environment variables. Supabase client not initialized.')
}

// Initialize Resend client
let resend: Resend | undefined;
if (RESEND_API_KEY) {
  try {
    resend = new Resend(RESEND_API_KEY)
  } catch (e: any) {
    console.error("Error initializing Resend client:", e.message);
  }
} else {
  console.error('CRITICAL: Missing RESEND_API_KEY environment variable. Resend client not initialized.')
}

const BATCH_SIZE = 45; // Resend API limit is 50 per call in 'to' array. Keep it slightly lower.

// --- HTML Email Template Function ---
const getFullHtmlContent = (subjectContent: string, bodyContent: string): string => {
  const currentYear = new Date().getFullYear();
  const logoUrl = "https://res.cloudinary.com/skyguide/image/upload/v1717789869/skyguide_logo_standard_resolution_color_trans_bkgd_x9x5k9.png"; // SkyGuide Production Logo

  // Convert user's plain text (from html_body input) to simple HTML paragraphs
  let formattedHtmlBodyContent: string;
  if (bodyContent && bodyContent.trim() !== '') {
      const escapeHtml = (unsafe: string) => 
          unsafe
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");

      const escapedText = escapeHtml(bodyContent);

      formattedHtmlBodyContent = escapedText
          .split(/\n\s*\n/) 
          .map(paragraph => paragraph.trim()) 
          .filter(paragraph => paragraph.length > 0) 
          .map(paragraph => `<p style="margin: 0 0 15px 0; color: #333333; font-size: 16px; line-height: 1.6;">${paragraph.replace(/\n/g, '<br>')}</p>`)
          .join('\n');
  } else {
      formattedHtmlBodyContent = '<p style="margin: 0 0 15px 0; color: #333333; font-size: 16px; line-height: 1.6;">(No message content was provided.)</p>'; 
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subjectContent}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f0f2f5; color: #333333; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 0; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; border-top: 5px solid #003366; }
        .header { text-align: center; padding: 30px 20px 20px 20px; }
        .header img { max-width: 180px; height: auto; margin-bottom: 10px; }
        .content-title { font-size: 22px; color: #003366; margin: 0 0 20px 0; font-weight: bold; text-align: center; }
        .content { padding: 10px 30px 30px 30px; color: #333333; line-height: 1.6; font-size: 16px; }
        .content p { margin: 0 0 15px 0; }
        .footer { text-align: center; padding: 20px 30px; background-color: #EAEAEA; font-size: 12px; color: #555555; line-height: 1.5; }
        .footer p { margin: 0 0 5px 0; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <img src="${logoUrl}" alt="SkyGuide Logo">
            <h1 class="content-title">${subjectContent}</h1>
        </div>
        <div class="content">
            ${formattedHtmlBodyContent}
            <p style="margin-top: 30px;">Best regards,<br>The SkyGuide Team</p>
        </div>
        <div class="footer">
            <p>&copy; ${currentYear} SkyGuide. All rights reserved.</p>
            <p>SkyGuide Alpha Program</p>
        </div>
    </div>
</body>
</html>
  `.trim();
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
  if (!resend) { // supabaseClient is optional for this specific function if not fetching emails
    console.error('Resend client not initialized due to missing RESEND_API_KEY.');
    return new Response(JSON.stringify({ error: 'Server configuration error: Email service unavailable.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503, // Service Unavailable
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
  let html_body: string; // This is the user-provided "plain text" or simple markup
  let text_body: string | undefined;
  let selected_emails: string[];

  try {
    const body = await req.json();
    subject = body.subject;
    html_body = body.html_body;
    text_body = body.text_body; 
    selected_emails = body.selected_emails;

    if (!subject || !html_body) {
      throw new Error('Missing subject or html_body in request.');
    }
    if (!selected_emails || !Array.isArray(selected_emails) || selected_emails.length === 0) {
      throw new Error('Missing or empty selected_emails array in request.');
    }
  } catch (error: any) {
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
      status: 400,
    });
  }

  console.log(`Mass email requested for ${recipientEmails.length} selected recipients. Subject: "${subject}"`);

  try {
    const finalHtmlContent = getFullHtmlContent(subject, html_body);
    let finalPlainTextBody = text_body; // Use provided text_body if available

    // If text_body is not provided, generate a simple one from html_body
    if (!finalPlainTextBody && html_body) {
        // Basic conversion: strip HTML tags and decode entities for plain text
        const stripHtml = (html: string) => html.replace(/<[^>]*>?/gm, '');
        const decodeEntities = (encodedString: string) => {
            const translate_re = /&(nbsp|amp|quot|lt|gt);/g;
            const translate: { [key: string]: string } = {
                "nbsp":" ",
                "amp" : "&",
                "quot": "\"",
                "lt"  : "<",
                "gt"  : ">"
            };
            return encodedString.replace(translate_re, function(match, entity) {
                return translate[entity];
            }).replace(/&#(\d+);/gi, function(match, numStr) {
                var num = parseInt(numStr, 10);
                return String.fromCharCode(num);
            });
        };
        finalPlainTextBody = decodeEntities(stripHtml(html_body.replace(/<br\s*\/?>/gi, '\n').replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n\n'))).trim();
    }


    // --- Send Emails in Batches --- 
    const totalEmails = recipientEmails.length;
    let successfullySentCount = 0;
    let errorsEncountered: { email: string; error: string }[] = [];
    let allBatchesSuccessful = true;

    console.log(`Starting to send emails in batches of ${BATCH_SIZE}. Total recipients: ${totalEmails}`);

    for (let i = 0; i < totalEmails; i += BATCH_SIZE) {
      const batch = recipientEmails.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} emails.`);

      try {
        const { data, error } = await resend.emails.send({
          from: RESEND_FROM_EMAIL!, // Already checked for null
          to: batch, 
          subject: subject,
          html: finalHtmlContent,
          text: finalPlainTextBody, 
        });

        if (error) {
          console.error(`Error sending batch ${Math.floor(i / BATCH_SIZE) + 1}: Resend API error:`, JSON.stringify(error, null, 2));
          batch.forEach(email => errorsEncountered.push({ email, error: error.message || 'Unknown Resend API error' }));
          allBatchesSuccessful = false;
        } else {
          console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} sent successfully. Response ID: ${data?.id}`);
          successfullySentCount += batch.length; 
        }
      } catch (batchError: any) {
            console.error(`Exception during email batch sending (first email: ${batch[0]}):`, batchError);
            batch.forEach(email => errorsEncountered.push({ email, error: batchError.message || 'Unknown exception' }));
            allBatchesSuccessful = false;
      }
    }
    
    if (!allBatchesSuccessful) {
      console.warn('Some email batches failed to send. Total errors:', errorsEncountered.length);
      return new Response(JSON.stringify({ 
        message: `Email sending partially failed. Successfully sent: ${successfullySentCount}/${totalEmails}. Errors: ${errorsEncountered.length}`, 
        successfully_sent: successfullySentCount,
        failed_count: errorsEncountered.length,
        errors: errorsEncountered 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 207, // Multi-Status
      });
    }

    console.log('All selected emails processed successfully.');
    return new Response(JSON.stringify({ message: 'All selected emails processed successfully!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (e: any) {
    console.error('Unexpected error in send_mass_email function:', e.message, e.stack);
    return new Response(JSON.stringify({ error: 'Internal Server Error: ' + e.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
