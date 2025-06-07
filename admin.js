document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#signupTable tbody');
    const subjectInput = document.getElementById('emailSubject');
    const messageInput = document.getElementById('emailMessage');
    const sendButton = document.getElementById('sendEmailButton');
    const adminMessage = document.getElementById('adminMessage');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const secretKeyInput = document.getElementById('massEmailSecretKey');

    const SUPABASE_URL = 'https://ulihpezvwculbmrddjfb.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaWhwZXp2d2N1bGJtcmRkamZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MzE2NTEsImV4cCI6MjA2NDQwNzY1MX0.hfxEN4-X9EJM9MnkYFjMjtWZyjXvKRMCWMIShp2infw';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function loadSignups() {
        const { data, error } = await supabase.from('alpha_signups').select('*').order('signed_up_at', { ascending: false });
        if (error) {
            adminMessage.textContent = 'Error loading signups';
            adminMessage.className = 'form-message error';
            return;
        }
        tableBody.innerHTML = '';
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${row.first_name}</td><td>${row.last_name}</td><td>${row.email}</td><td>${row.airline}</td><td>${row.job_title}</td><td>${row.base || ''}</td><td><input type="checkbox" class="user-select-checkbox" value="${row.email}"></td><td>${new Date(row.signed_up_at).toLocaleString()}</td>`;
            tableBody.appendChild(tr);
        });
    }

    selectAllCheckbox.addEventListener('change', () => {
        const userCheckboxes = document.querySelectorAll('.user-select-checkbox');
        userCheckboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
        });
    });

    sendButton.addEventListener('click', async () => {
        const subject = subjectInput.value.trim();
        const html_body = messageInput.value.trim(); // Edge function expects html_body
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
        adminMessage.className = 'form-message info'; // Use a neutral 'info' class

        const { data, error } = await supabase.functions.invoke('send_mass_email', {
            body: { subject, html_body, selected_emails: selectedEmails },
            headers: {
                'Authorization': `Bearer ${secretKey}`
            }
        });
        if (error) {
            adminMessage.textContent = `Failed to send emails: ${error.message || 'Unknown error'}`;
            adminMessage.className = 'form-message error';
        } else {
            adminMessage.textContent = data ? (data.message || 'Emails processed successfully!') : 'Emails sent successfully (no specific message from server).'; // Display server message if available
            adminMessage.className = 'form-message success';
            subjectInput.value = '';
            messageInput.value = '';
        }
    });

    loadSignups();
});
