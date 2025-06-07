console.log('admin.js script started');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded event fired');
    const tableBody = document.querySelector('#signupTable tbody');
    console.log('signupsTableBody element:', tableBody);
    const subjectInput = document.getElementById('emailSubject');
    const messageInput = document.getElementById('emailMessage');
    const sendButton = document.getElementById('sendEmailButton');
    const adminMessage = document.getElementById('adminMessage');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const secretKeyInput = document.getElementById('massEmailSecretKey');

    const SUPABASE_URL = 'https://ulihpezvwculbmrddjfb.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaWhwZXp2d2N1bGJtcmRkamZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MzE2NTEsImV4cCI6MjA2NDQwNzY1MX0.hfxEN4-X9EJM9MnkYFjMjtWZyjXvKRMCWMIShp2infw';
    console.log('Attempting to create Supabase client. window.supabase is:', window.supabase);
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client created:', supabase);

    async function loadSignups() {
        console.log('loadSignups function called');
        if (!tableBody) {
            console.error('Cannot load signups because tableBody element is null.');
            adminMessage.textContent = 'Error: UI element for table body not found.';
            adminMessage.className = 'form-message error';
            return;
        }
        const { data, error } = await supabase.from('alpha_signups').select('*');
        console.log('Supabase response data:', data);
        console.log('Supabase response error:', error);
        if (data && data.length > 0) {
            console.log('Raw created_at for first record:', data[0].created_at);
        }
        if (error) {
            adminMessage.textContent = 'Error loading signups';
            adminMessage.className = 'form-message error';
            console.error('Error loading signups:', error);
            return;
        }
        tableBody.innerHTML = ''; // Clear existing rows
        data.forEach((signup, index) => {
            const row = tableBody.insertRow();
            
            const cellCheckbox = row.insertCell();
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'user-select-checkbox';
            checkbox.value = signup.email;
            cellCheckbox.appendChild(checkbox);

            row.insertCell().textContent = index + 1; // No.
            row.insertCell().textContent = new Date(signup.created_at).toLocaleString(); // Created At
            row.insertCell().textContent = signup.first_name;
            row.insertCell().textContent = signup.last_name;
            row.insertCell().textContent = signup.email;
            row.insertCell().textContent = signup.airline;
            row.insertCell().textContent = signup.job_title;
            row.insertCell().textContent = signup.crew_base;
            row.insertCell().textContent = signup.agreed_to_terms ? 'Yes' : 'No';
        });

        document.querySelectorAll('.user-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (!checkbox.checked) {
                    selectAllCheckbox.checked = false;
                }
            });
        });
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            const userCheckboxes = document.querySelectorAll('.user-select-checkbox');
            userCheckboxes.forEach(checkbox => {
                checkbox.checked = selectAllCheckbox.checked;
            });
        });
    }

    if (sendButton) {
        sendButton.addEventListener('click', async () => {
            const subject = subjectInput.value.trim();
            const html_body = messageInput.value.trim(); 
            const secretKey = secretKeyInput.value.trim();
            const selectedEmails = Array.from(document.querySelectorAll('.user-select-checkbox:checked'))
                                        .map(checkbox => checkbox.value);

            if (!subject || !html_body || !secretKey) {
                adminMessage.textContent = 'Secret Key, Subject, and Message are required.';
                adminMessage.className = 'form-message error';
                return;
            }
            if (selectedEmails.length === 0) {
                adminMessage.textContent = 'Please select at least one user to email.';
                adminMessage.className = 'form-message error';
                return;
            }

            adminMessage.textContent = 'Sending emails...';
            adminMessage.className = 'form-message info'; 

            const { data: responseData, error: responseError } = await supabase.functions.invoke('send_mass_email', { // Renamed to avoid conflict
                body: { subject, html_body, selected_emails: selectedEmails },
                headers: { 'Authorization': `Bearer ${secretKey}` }
            });

            if (responseError) {
                adminMessage.textContent = `Failed to send emails: ${responseError.message || 'Unknown error'}`;
                adminMessage.className = 'form-message error';
                console.error('Error invoking send_mass_email:', responseError);
            } else if (responseData && responseData.error) {
                 adminMessage.textContent = `Failed to send emails: ${responseData.error}`;
                 adminMessage.className = 'form-message error';
                 console.error('Error from send_mass_email function:', responseData.error);
            } else {
                adminMessage.textContent = responseData ? (responseData.message || 'Emails processed successfully!') : 'Emails sent successfully.';
                adminMessage.className = 'form-message success';
                if (subjectInput) subjectInput.value = '';
                if (messageInput) messageInput.value = '';
            }
        });
    }
    
    loadSignups(); 
});
