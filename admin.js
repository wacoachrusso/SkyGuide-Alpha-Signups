document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#signupTable tbody');
    const subjectInput = document.getElementById('emailSubject');
    const messageInput = document.getElementById('emailMessage');
    const sendButton = document.getElementById('sendEmailButton');
    const adminMessage = document.getElementById('adminMessage');

    const SUPABASE_URL = 'YOUR_SUPABASE_URL';
    const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
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
            tr.innerHTML = `<td>${row.first_name}</td><td>${row.last_name}</td><td>${row.email}</td><td>${row.airline}</td><td>${row.job_title}</td><td>${row.base || ''}</td><td>${row.signed_up_at}</td>`;
            tableBody.appendChild(tr);
        });
    }

    sendButton.addEventListener('click', async () => {
        const subject = subjectInput.value.trim();
        const message = messageInput.value.trim();
        if (!subject || !message) {
            adminMessage.textContent = 'Subject and message required.';
            adminMessage.className = 'form-message error';
            return;
        }
        const { error } = await supabase.functions.invoke('send_mass_email', {
            body: { subject, message }
        });
        if (error) {
            adminMessage.textContent = 'Failed to send emails';
            adminMessage.className = 'form-message error';
        } else {
            adminMessage.textContent = 'Emails sent successfully';
            adminMessage.className = 'form-message success';
            subjectInput.value = '';
            messageInput.value = '';
        }
    });

    loadSignups();
});
