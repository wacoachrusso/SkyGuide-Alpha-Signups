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

// Initialize Supabase client (optional if not directly used, but good practice)
let supabaseClient: SupabaseClient
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
} else {
  console.warn('Missing Supabase URL or Service Role Key environment variables. Supabase client not initialized.')
}

// Initialize Resend client
let resend: Resend
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY)
} else {
  console.error('CRITICAL: Missing RESEND_API_KEY environment variable. Resend client not initialized.')
}

// --- HTML Email Template Function ---
const getFullHtmlContent = (subjectContent: string, bodyContent: string): string => {
  const currentYear = new Date().getFullYear();
  const logoUrl = "https://res.cloudinary.com/skyguide/image/upload/v1717789869/skyguide_logo_standard_resolution_color_trans_bkgd_x9x5k9.png";
  
  // Ensure bodyContent is treated as HTML. If it might contain characters that break HTML, sanitize/escape appropriately.
  // For now, assuming html_body from admin panel is intended as safe HTML.
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subjectContent}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #333333; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eeeeee; }
        .header img { max-width: 200px; height: auto; margin-bottom: 15px; }
        .content { padding: 20px 0; color: #333333; line-height: 1.6; font-size: 16px; }
        .content h2 { color: #2c3e50; margin-top: 0; font-size: 1.5em; }
        .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 0.9em; color: #777777; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${logoUrl}" alt="SkyGuide Logo">
            <h2>${subjectContent}</h2>
        </div>
        <div class="content">
            ${bodyContent}
        </div>
        <div class="footer">
            <p>&copy; ${currentYear} SkyGuide. All rights reserved.</p>
            <!-- Consider adding an unsubscribe link mechanism if legally required or for best practice -->
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

  try {
    let body: any = {}
    let parseError = false
    try {
      body = await req.json()
    } catch (_) {
      parseError = true
    }

    const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    const providedSecret = headerToken || body.secret_key

    if (!providedSecret || !MASS_EMAIL_SECRET_KEY || providedSecret !== MASS_EMAIL_SECRET_KEY) {
      console.warn('Unauthorized attempt to send mass email.')
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid secret key.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    if (!resend) {
      console.error('Resend client not initialized. Cannot send emails. Check RESEND_API_KEY.');
      return new Response(JSON.stringify({ error: 'Server configuration error: Email service not available.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503, // Service Unavailable
      });
    }
    if (!RESEND_FROM_EMAIL) {
        console.error('RESEND_FROM_EMAIL environment variable is not set.');
        return new Response(JSON.stringify({ error: 'Server configuration error: From email not set.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }

    if (parseError || !body || typeof body !== 'object') {
      console.error('Error parsing request body.')
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { subject, html_body, text_body, selected_emails } = body;

    if (!subject || !html_body) {
      return new Response(JSON.stringify({ error: 'Missing subject or html_body in request.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    let recipients: string[] = []
    if (Array.isArray(selected_emails) && selected_emails.length > 0) {
      recipients = selected_emails
    } else {
      // Fetch all signups if no specific recipients provided
      if (!supabaseClient) {
        console.error('Supabase client not initialized. Cannot fetch recipients.')
        return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }
      const { data: signupRows, error: fetchError } = await supabaseClient
        .from('alpha_signups')
        .select('email')

      if (fetchError) {
        console.error('Error fetching signup emails:', fetchError)
        return new Response(JSON.stringify({ error: 'Failed to retrieve recipient emails.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      recipients = (signupRows ?? []).map((row: any) => row.email).filter((e: string) => !!e)
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'No recipient emails found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    console.log(`Processing mass email. Subject: "${subject}". To ${recipients.length} users.`);
    const finalHtmlContent = getFullHtmlContent(subject, html_body);
    const textContent = typeof text_body === 'string' && text_body.trim().length > 0 ? text_body.trim() : undefined;
    
    let allBatchesSuccessful = true;
    const errorsEncountered: { email: string, error: string }[] = [];
    const BATCH_SIZE = 45; // Resend API limit is 50 per call in 'to' array.

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batchEmails = recipients.slice(i, i + BATCH_SIZE);
        console.log(`Sending batch of ${batchEmails.length} emails. First email in batch: ${batchEmails[0]}`);
        try {
            const { data: sendData, error: sendError } = await resend.emails.send({
                from: RESEND_FROM_EMAIL,
                to: batchEmails,
                subject: subject, // Resend API requires subject here, even if it's in HTML
                html: finalHtmlContent,
                ...(textContent ? { text: textContent } : {}),
            });

            if (sendError) {
                console.error(`Error sending email batch starting with ${batchEmails[0]}:`, sendError);
                batchEmails.forEach(email => errorsEncountered.push({ email, error: sendError.message || 'Unknown Resend error' }));
                allBatchesSuccessful = false;
            } else {
                console.log(`Email batch sent successfully, ID: ${sendData?.id}. First email: ${batchEmails[0]}`);
            }
        } catch (batchError) {
            console.error(`Exception during email batch sending (first email: ${batchEmails[0]}):`, batchError);
            batchEmails.forEach(email => errorsEncountered.push({ email, error: batchError.message || 'Unknown exception' }));
            allBatchesSuccessful = false;
        }
    }
    
    if (!allBatchesSuccessful) {
      console.warn('Some email batches failed to send. Total errors:', errorsEncountered.length);
      return new Response(JSON.stringify({ 
        message: 'Some emails may not have been sent. Check server logs for details.', 
        errors: errorsEncountered // Provides more detailed error feedback
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

  } catch (error) {
    console.error('Unexpected error in send_mass_email function:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error: ' + (error.message || 'An unknown error occurred') }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})
