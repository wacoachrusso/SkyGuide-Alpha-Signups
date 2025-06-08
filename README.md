# SkyGuide Alpha Tester Signup Landing Page

This project contains the files for the SkyGuide Alpha Tester signup landing page.

## Project Structure

- `index.html`: The main HTML file for the landing page.
- `style.css`: CSS styles for the page.
- `admin.html`: Simple admin console for viewing signups and sending mass emails.
- `admin.js`: JavaScript for the admin console.
- `script.js`: JavaScript for form handling, dynamic content, and Supabase integration.
- `README.md`: This file, containing setup and deployment instructions.

## Setup Instructions

Follow these steps to get the landing page up and running with all integrations.

### 1. SkyGuide Logo

- Save your logo (e.g., as `transparent logo.png`) into an `assets` folder within your project directory (`c:\Users\wacoa\skyguide alpha signup\assets\transparent logo.png`).
- The `index.html` has been updated to use `<img src="assets/transparent logo.png" alt="SkyGuide Logo" class="logo">`.
- You can adjust the path in `index.html` if you save it elsewhere.
  And in `style.css`:
  ```css
  .logo {
    height: 50px; /* Adjust as needed */
    width: auto;
  }
  ```
- You might want to use a placeholder image for the hero section background in `style.css` or replace the Unsplash URL with a more fitting one if desired.

### 2. Supabase Setup

Supabase will be used to store signup data and manage the 350 tester limit securely.

**A. Create a Supabase Project:**
   - Go to [supabase.com](https://supabase.com/) and create a new project.
   - Note your Project URL and `anon` (public) key.

**B. Create Signups Table:**
   - In your Supabase project, go to the `Table Editor`.
   - Click `+ New table`.
   - Name it `alpha_signups` (or similar).
   - Add the following columns (adjust types as needed):
     - `id` (uuid, primary key, auto-generated)
     - `created_at` (timestamp with timezone, default `now()`)
     - `firstName` (text)
     - `lastName` (text)
     - `email` (text, consider enabling `isUnique` if emails must be unique)
     - `airline` (text)
    - `job_title` (text)
     - `agreedToTerms` (boolean)
     - `signedUpAt` (timestamp with timezone) - *This is from the client, `created_at` is server time.*
   - Ensure Row Level Security (RLS) is enabled for this table. Initially, you might keep it permissive for function access and then tighten it.

**C. Create Supabase Edge Functions for Secure Handling:**
   You'll need two Edge Functions: one to check the signup count/status and one to submit the signup (which also checks the limit server-side).

   1.  **`get_signup_status` Function:**
       - In your Supabase project, go to `Edge Functions` and create a new function named `get_signup_status`.
       - **Content for `get_signup_status/index.ts`:**
         ```typescript
         import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
         import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
         import { corsHeaders } from '../_shared/cors.ts' // See shared CORS below

         const SIGNUP_LIMIT = 350;

         serve(async (req) => {
           if (req.method === 'OPTIONS') {
             return new Response('ok', { headers: corsHeaders })
           }
           try {
             const supabaseClient = createClient(
               Deno.env.get('SUPABASE_URL') ?? '',
               Deno.env.get('SUPABASE_ANON_KEY') ?? '',
               { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
             )

             const { count, error: countError } = await supabaseClient
               .from('alpha_signups')
               .select('*', { count: 'exact', head: true });

             if (countError) throw countError;

             return new Response(
               JSON.stringify({ limitReached: count !== null && count >= SIGNUP_LIMIT }),
               { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
             )
           } catch (error) {
             return new Response(JSON.stringify({ error: error.message }), {
               headers: { ...corsHeaders, 'Content-Type': 'application/json' },
               status: 500,
             })
           }
         })
         ```

   2.  **`submit_alpha_signup` Function:**
       - Create another Edge Function named `submit_alpha_signup`.
       - **Content for `submit_alpha_signup/index.ts`:**
         ```typescript
         import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
         import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
         import { corsHeaders } from '../_shared/cors.ts' // See shared CORS below

         const SIGNUP_LIMIT = 350;

         serve(async (req) => {
           if (req.method === 'OPTIONS') {
             return new Response('ok', { headers: corsHeaders })
           }
           try {
             const supabaseClient = createClient(
               Deno.env.get('SUPABASE_URL') ?? '',
               Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use Service Role Key for inserts
               // { global: { headers: { Authorization: req.headers.get('Authorization')! } } } // Not needed for service role
             );

             // Check limit first
             const { count, error: countError } = await supabaseClient
               .from('alpha_signups')
               .select('*', { count: 'exact', head: true });

             if (countError) throw countError;

             if (count !== null && count >= SIGNUP_LIMIT) {
               return new Response(
                 JSON.stringify({ success: false, error: true, limitReached: true, message: 'Signup limit reached.' }),
                 { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
               );
             }

             const signupData = await req.json();

             // Basic validation (add more as needed)
             if (!signupData.email || !signupData.firstName || !signupData.lastName) {
                return new Response(JSON.stringify({ success: false, error: true, message: 'Missing required fields.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
                });
             }

             const { data, error } = await supabaseClient
               .from('alpha_signups')
               .insert(signupData)
               .select(); 

             if (error) throw error;

             // Optional: Trigger Resend email here (see Resend section)

             return new Response(
               JSON.stringify({ success: true, data: data }),
               { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
             )
           } catch (error) {
             return new Response(JSON.stringify({ success: false, error: true, message: error.message }), {
               headers: { ...corsHeaders, 'Content-Type': 'application/json' },
               status: 500,
             })
           }
         })
         ```

   3.  **Shared CORS file (`_shared/cors.ts`):**
       - Create a shared file for CORS headers. In your Supabase functions directory, create `_shared/cors.ts`:
         ```typescript
         export const corsHeaders = {
           'Access-Control-Allow-Origin': '*', // For development. For production, restrict to your domain.
           'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
         }
         ```
       - **Important for Production:** Change `'*'` in `Access-Control-Allow-Origin` to your actual domain (e.g., `https://yourdomain.com`).

   4.  **Environment Variables for Functions:**
       - In your Supabase project settings (or via `supabase secrets set` if using CLI):
         - Set `SUPABASE_URL` (your project URL)
         - Set `SUPABASE_ANON_KEY` (your project anon key)
         - Set `SUPABASE_SERVICE_ROLE_KEY` (your project service role key - found in Project Settings > API)

   5.  **Deploy Functions:**
       - Deploy these functions using the Supabase CLI or the online dashboard.

**D. Update `script.js`:**
   - Open `script.js`.
   - Replace `'YOUR_SUPABASE_URL'` and `'YOUR_SUPABASE_ANON_KEY'` with your actual Supabase Project URL and `anon` key.
     ```javascript
     const SUPABASE_URL = 'https://your-project-ref.supabase.co';
     const SUPABASE_ANON_KEY = 'your-anon-public-key';
     ```

### 3. Resend Integration (Automated Emails)

Resend will be used for sending automated emails.

**A. Sign Up for Resend:**
   - Go to [resend.com](https://resend.com/) and create an account.
   - Get your API key.
   - Verify your sending domain.

**B. Initial Confirmation Email (Optional - via Supabase Function):
   - You can extend the `submit_alpha_signup` Edge Function to send a confirmation email via Resend upon successful signup.
   - Add your Resend API key as an environment variable in Supabase (e.g., `RESEND_API_KEY`).
   - Modify `submit_alpha_signup/index.ts` to include email sending logic:
     ```typescript
     // Inside the try block of submit_alpha_signup, after successful insert:
     if (data && data.length > 0) { // Assuming 'data' is the result of the insert
        const newSignup = data[0];
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: 'SkyGuide <your-verified-email@yourdomain.com>',
                        to: [newSignup.email],
                        subject: 'Welcome to SkyGuide Alpha Program!',
                        html: `<h1>Hi ${newSignup.firstName},</h1><p>Thank you for signing up as an alpha tester for SkyGuide! We're thrilled to have you. We'll be in touch with more details soon.</p>`
                    })
                });
            } catch (emailError) {
                console.error('Failed to send confirmation email:', emailError);
                // Don't fail the whole signup if email fails, just log it.
            }
        }
     }
     ```

**C. Bi-Weekly Feedback Emails:**
   - This requires a recurring mechanism.
   - **Option 1 (Supabase Scheduled Functions):** Supabase supports cron jobs for Edge Functions. You could write an Edge Function that queries `alpha_signups` and sends emails via Resend. Schedule this function to run every two weeks.
   - **Option 2 (External Service):** Use a service like GitHub Actions (on a schedule), Pipedream, Zapier, or a custom server with a cron job to trigger an API endpoint (which could be another Supabase Function) that sends the bi-weekly emails.
   - The content of these emails will include your questionnaire.

### 4. GitHub for Version Control

**A. Create a GitHub Repository:**
   - Go to [github.com](https://github.com/) and create a new repository for this project.

**B. Initialize Git and Push:**
   - In your local project directory (`c:\Users\wacoa\skyguide alpha signup`):
     ```bash
     git init
     git add .
     git commit -m "Initial commit: Landing page structure and basic styling"
     git branch -M main
     git remote add origin https://github.com/your-username/your-repository-name.git
     git push -u origin main
     ```
   - Replace `your-username` and `your-repository-name`.

### 5. Deployment (Render or Netlify)

Both Render and Netlify offer free tiers suitable for static sites and can deploy directly from GitHub.

**General Steps (similar for both):**

1.  **Sign up/Log in** to Render ([render.com](https://render.com/)) or Netlify ([netlify.com](https://www.netlify.com/)).
2.  **Create a New Site/Static Site.**
3.  **Connect to GitHub:** Authorize the platform to access your GitHub repositories.
4.  **Select Your Repository:** Choose the repository you just created.
5.  **Configure Build Settings:**
    - **Branch to deploy:** `main` (or your default branch).
    - **Build command:** Usually not needed for a simple static site (HTML, CSS, JS). If you add a build step later (e.g., for minification), you'd specify it here.
    - **Publish directory / Public directory:** `.` (root of the repository) or leave as default if it correctly identifies your `index.html` at the root.
6.  **Environment Variables (Important for Supabase):**
    - Although the Supabase URL and Anon Key are in `script.js` for this client-side example, for a more robust setup (especially if you had server-side rendering or a backend component on these platforms), you'd set them as environment variables.
    - For this client-side only setup, ensure the values in `script.js` are correct *before* pushing to GitHub for deployment.
7.  **Deploy!**

**Netlify Specifics:**
   - Netlify is very straightforward for static sites. It will likely auto-detect settings.

**Render Specifics:**
   - Choose `Static Site` as the service type.

After deployment, you'll get a URL like `your-site-name.netlify.app` or `your-site-name.onrender.com`.

### 6. Namecheap for Domain Management

Once your site is deployed and you have a URL from Netlify/Render:

1.  **Log in to Namecheap.**
2.  **Go to your domain's DNS settings.**
3.  **Add DNS Records:**
    - **For Netlify:** Follow Netlify's documentation for custom domains. Typically involves adding `CNAME` and/or `A` records pointing to Netlify's servers.
    - **For Render:** Follow Render's documentation for custom domains. Typically involves adding `CNAME` (for `www`) and `A` records (for the root domain) pointing to Render's provided values.
4.  **Update Domain in Netlify/Render:** In your site settings on the hosting platform, add your custom domain.
5.  **Wait for DNS Propagation:** This can take a few minutes to a few hours.

## Development Notes

- **Testing the 350 Limit:** You can temporarily lower the `SIGNUP_LIMIT` in your Supabase Edge Functions to test the limit behavior.
- **Error Handling:** The `script.js` includes basic error handling. Enhance as needed.
- **Mobile Responsiveness:** The `style.css` includes basic media queries. Test thoroughly on different devices and refine.

- The admin console (`admin.html`) lets you view all signups and send mass emails via the `send_mass_email` edge function. The request must include an `Authorization: Bearer <MASS_EMAIL_SECRET_KEY>` header.
- If no `selected_emails` array is provided in the request, the function automatically emails all signups from the `alpha_signups` table.
Good luck with your alpha testing program!
