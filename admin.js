console.log('admin.js script started');
document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://ulihpezvwculbmrddjfb.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaWhwZXp2d2N1bGJtcmRkamZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MzE2NTEsImV4cCI6MjA2NDQwNzY1MX0.hfxEN4-X9EJM9MnkYFjMjtWZyjXvKRMCWMIShp2infw';

    const signupsTableBody = document.getElementById('signupsTableBody');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const sendEmailButton = document.getElementById('sendEmailButton');
    const emailSubject = document.getElementById('emailSubject');
    const emailBody = document.getElementById('emailBody');
    const adminMessage = document.getElementById('adminMessage');
    const massEmailSecretKey = document.getElementById('massEmailSecretKey');

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function loadSignups() {
        const { data, error } = await supabase.from('alpha_signups').select('*'); // Temporarily removed order for debugging
        console.log('Supabase response data:', data);
        console.log('Supabase response error:', error);
        if (error) {
            adminMessage.textContent = 'Error loading signups';
            adminMessage.className = 'form-message error';
            console.error('Error loading signups:', error);
            return;
        }

        signupsTableBody.innerHTML = ''; // Clear existing rows
        data.forEach((signup, index) => {
            const row = signupsTableBody.insertRow();
            row.insertCell().innerHTML = `<input type="checkbox" class="user-checkbox" value="${signup.email}">`;
            row.insertCell().textContent = index + 1;
            row.insertCell().textContent = new Date(signup.signed_up_at).toLocaleString();
            row.insertCell().textContent = signup.first_name;
            row.insertCell().textContent = signup.last_name;
            row.insertCell().textContent = signup.email;
            row.insertCell().textContent = signup.airline;
            row.insertCell().textContent = signup.job_title;
            row.insertCell().textContent = signup.crew_base;
            row.insertCell().textContent = signup.agreed_to_terms ? 'Yes' : 'No';
        });

        // Add event listener for individual checkboxes to uncheck "Select All" if one is unchecked
        document.querySelectorAll('.user-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (!checkbox.checked) {
                    selectAllCheckbox.checked = false;
                }
            });
        });
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (event) => {
            document.querySelectorAll('.user-checkbox').forEach(checkbox => {
                checkbox.checked = event.target.checked;
            });
        });
    }

    if (sendEmailButton) {
        sendEmailButton.addEventListener('click', async () => {
            const subject = emailSubject.value.trim();
            const html_body = emailBody.value.trim();
            const secretKey = massEmailSecretKey.value.trim();
            const selected_emails = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);

            if (!subject || !html_body) {
                adminMessage.textContent = 'Subject and body are required.';
                adminMessage.className = 'form-message error';
                return;
            }

            if (selected_emails.length === 0) {
                adminMessage.textContent = 'Please select at least one user to email.';
                adminMessage.className = 'form-message error';
                return;
            }

            if (!secretKey) {
                adminMessage.textContent = 'Mass Email Secret Key is required.';
                adminMessage.className = 'form-message error';
                return;
            }

            adminMessage.textContent = 'Sending emails...';
            adminMessage.className = 'form-message info';

            try {
                const { data, error } = await supabase.functions.invoke('send_mass_email', {
                    body: JSON.stringify({ subject, html_body, selected_emails }),
                    headers: {
                        'Authorization': `Bearer ${secretKey}`
                    }
                });

                if (error) throw error;

                if (data.error) {
                    throw new Error(data.error);
                }

                adminMessage.textContent = data.message || 'Emails sent successfully!';
                adminMessage.className = 'form-message success';
            } catch (error) {
                console.error('Error sending mass email:', error);
                adminMessage.textContent = `Error: ${error.message}`;
                adminMessage.className = 'form-message error';
            }
        });
    }

    // Initial load of signups
    if (signupsTableBody) {
        loadSignups();
    }
});
