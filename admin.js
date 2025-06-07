console.log('admin.js script started');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded event fired');
    const tableBody = document.querySelector('#signupTable tbody');
    console.log('signupsTableBody element:', tableBody); // Log for the new tableBody variable
    const subjectInput = document.getElementById('emailSubject');
    const messageInput = document.getElementById('emailMessage'); // HTML ID is emailMessage, JS was emailBody
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
        const { data, error } = await supabase.from('alpha_signups').select('*'); // Temporarily removed order for debugging
        console.log('Supabase response data:', data);
        console.log('Supabase response error:', error);
        if (error) {
            adminMessage.textContent = 'Error loading signups';
            adminMessage.className = 'form-message error';
            console.error('Error loading signups:', error);
            return;
        }
        tableBody.innerHTML = ''; // Clear existing rows
        data.forEach((signup, index) => { // Assuming 'data' is the array of signups
            const row = tableBody.insertRow();
            // Checkbox cell
            const cellCheckbox = row.insertCell();
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'user-select-checkbox'; // Consistent class name
            checkbox.value = signup.email;
            cellCheckbox.appendChild(checkbox);

            row.insertCell().textContent = index + 1; // Number
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
        document.querySelectorAll('.user-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (!checkbox.checked) {
                    selectAllCheckbox.checked = false;
                }
            });
        });
    }

    if (selectAllCheckbox) { // Check if selectAllCheckbox exists
        selectAllCheckbox.addEventListener('change', () => {
            const userCheckboxes = document.querySelectorAll('.user-select-checkbox');
            userCheckboxes.forEach(checkbox => {
                checkbox.checked = selectAllCheckbox.checked;
            });
        });
    }

    if (sendButton) { // Check if sendButton exists
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

            const { data, error } = await supabase.functions.invoke('send_mass_email', {
                body: { subject, html_body, selected_emails: selectedEmails }, // Ensure this matches Edge Function
                headers: {
                    'Authorization': `Bearer ${secretKey}`
                }
            });
            if (error) {
                adminMessage.textContent = `Failed to send emails: ${error.message || 'Unknown error'}`;
                adminMessage.className = 'form-message error';
                console.error('Error invoking send_mass_email:', error);
            } else if (data && data.error) { // Check for functional error from Edge Function
                 adminMessage.textContent = `Failed to send emails: ${data.error}`;
                 adminMessage.className = 'form-message error';
                 console.error('Error from send_mass_email function:', data.error);
            }else {
                adminMessage.textContent = data ? (data.message || 'Emails processed successfully!') : 'Emails sent successfully (no specific message from server).';
                adminMessage.className = 'form-message success';
                if (subjectInput) subjectInput.value = '';
                if (messageInput) messageInput.value = '';
            }
        });
    }
    
    // Unconditional call to loadSignups
    loadSignups(); 
});
