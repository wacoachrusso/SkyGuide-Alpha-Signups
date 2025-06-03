document.addEventListener('DOMContentLoaded', () => {
    const airlineSelect = document.getElementById('airline');
    const jobRoleSelect = document.getElementById('jobRole');
    const signupForm = document.getElementById('alphaSignupForm');
    const baseInput = document.getElementById("base");
    const formMessage = document.getElementById('formMessage');
    const submitButton = document.getElementById('submitButton');
    const thankYouModal = document.getElementById('thankYouModal');
    const closeModalButton = document.querySelector('.modal .close-button');
    const disclaimerModal = document.getElementById("disclaimerModal");
    const disclaimerButton = document.getElementById("disclaimerAcknowledgeButton");
    const agreementCheckbox = document.getElementById('agreement');
    const signupFormContainer = document.getElementById('signupFormContainer');
    const limitReachedMessageContainer = document.getElementById('limitReachedMessageContainer');

    // --- Supabase Client Setup (Update with your details in README) ---
    // These will be placeholders; actual values will come from user's Supabase project
    const SUPABASE_URL = 'https://ulihpezvwculbmrddjfb.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaWhwZXp2d2N1bGJtcmRkamZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MzE2NTEsImV4cCI6MjA2NDQwNzY1MX0.hfxEN4-X9EJM9MnkYFjMjtWZyjXvKRMCWMIShp2infw';
    
    let supabase;
    try {
        if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } else {
            console.warn('Supabase URL and Key not configured. Form submission will be simulated.');
        }
    } catch (error) {
        console.error('Error initializing Supabase client:', error);
        formMessage.textContent = 'Error initializing. Please try again later.';
        formMessage.className = 'form-message error';
    }

    const airlineJobRoles = {
        "United Airlines": ["Pilot", "Flight Attendant"],
        "Alaska Airlines": ["Flight Attendant"],
        "American Airlines": ["Pilot", "Flight Attendant"],
        "Delta Airlines": ["Pilot"]
    };

    airlineSelect.addEventListener('change', () => {
        const selectedAirline = airlineSelect.value;
        jobRoleSelect.innerHTML = '<option value="">Select your job role</option>'; // Reset
        
        if (selectedAirline && airlineJobRoles[selectedAirline]) {
            jobRoleSelect.disabled = false;
            airlineJobRoles[selectedAirline].forEach(role => {
                const option = document.createElement('option');
                option.value = role;
                option.textContent = role;
                jobRoleSelect.appendChild(option);
            });
        } else {
            jobRoleSelect.disabled = true;
        }
    });

    // Check signup limit on page load
    async function checkSignupLimit() {
        if (!supabase) {
            console.log('Supabase not configured, skipping signup limit check.');
            return false; // Assume signups are open if Supabase isn't set up for client-side check
        }
        try {
            const { data, error } = await supabase.functions.invoke('get_signup_status');

            if (error) {
                console.error('Error checking signup status:', error);
                // On error, assume limit not reached to allow attempts, server will verify
                if (signupFormContainer) signupFormContainer.style.display = 'block';
                if (limitReachedMessageContainer) limitReachedMessageContainer.style.display = 'none';
                return false;
            }

            if (data && data.limitReached) {
                disableFormFields(); // This hides form, shows limit message
                return true;
            } else {
                // Limit NOT reached or data is indeterminate (but no error)
                if (signupFormContainer) signupFormContainer.style.display = 'block';
                if (limitReachedMessageContainer) limitReachedMessageContainer.style.display = 'none';
                return false;
            }
        } catch (e) {
            console.error('Exception checking signup limit:', e);
            // On exception, assume limit not reached
            if (signupFormContainer) signupFormContainer.style.display = 'block';
            if (limitReachedMessageContainer) limitReachedMessageContainer.style.display = 'none';
            return false;
        }
    }

    function disableFormFields() {
        // This function is called when the limit is reached
        if (signupFormContainer && limitReachedMessageContainer) {
            signupFormContainer.style.display = 'none'; // Hide the form
            limitReachedMessageContainer.style.display = 'block'; // Show the limit reached message
        }
        // Keep existing logic to disable individual fields if needed, though hiding the form is primary
        const firstNameInput = document.getElementById('firstName');
        const lastNameInput = document.getElementById('lastName');
        const emailInput = document.getElementById('email');
        if (firstNameInput) firstNameInput.disabled = true;
        if (lastNameInput) lastNameInput.disabled = true;
        if (emailInput) emailInput.disabled = true;
        if (airlineSelect) airlineSelect.disabled = true;
        if (jobRoleSelect) jobRoleSelect.disabled = true;
        if (agreementCheckbox) agreementCheckbox.disabled = true;
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Signups Closed'; // Update button text
        }
    };

    if (supabase) {
        checkSignupLimit();
    }

    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        formMessage.textContent = '';
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';

        if (await checkSignupLimit()) { // Re-check limit on submit
            submitButton.textContent = 'Sign Up Now'; // Reset button text
            submitButton.disabled = false; // Ensure button is re-enabled
            return; 
        }

        const formData = {
            first_name: document.getElementById('firstName').value, 
            last_name: document.getElementById('lastName').value,  
            email: document.getElementById('email').value,
            airline: document.getElementById('airline').value,
            base: baseInput.value,
            job_title: document.getElementById('jobRole').value,
            agreed_to_terms: document.getElementById('agreement').checked, // Corrected ID
            signed_up_at: new Date().toISOString()
        };

        // Client-side validation for required fields
        if (!formData.first_name || !formData.last_name || !formData.email || !formData.airline || !formData.base || !formData.job_title) {
            formMessage.textContent = "Please fill out all required fields (First Name, Last Name, Email, Airline, Base, Job Role).";
            formMessage.className = 'form-message error';
            submitButton.disabled = false;
            submitButton.textContent = 'Sign Up Now';
            return;
        }

        // Validate job role for selected airline again (client-side)
        const allowedRoles = airlineJobRoles[formData.airline];
        if (!allowedRoles || !allowedRoles.includes(formData.job_title)) {
            formMessage.textContent = 'Invalid job role for the selected airline. Please check your selection.';
            formMessage.className = 'form-message error';
            submitButton.disabled = false;
            submitButton.textContent = 'Sign Up Now';
            return;
        }

        if (!supabase) {
            console.log('Supabase not configured. Simulating successful submission:', formData);
            // Simulate success for local testing without Supabase
            setTimeout(() => {
                showThankYouModal();
                signupForm.reset();
                jobRoleSelect.disabled = true; 
                submitButton.disabled = false;
                submitButton.textContent = 'Sign Up Now';
            }, 1000);
            return;
        }

        try {
            // This function 'submit_alpha_signup' would be a Supabase Edge Function
            // It handles the 350 limit check server-side before inserting
            const { data, error } = await supabase.functions.invoke('submit_alpha_signup', {
                body: formData // Corrected variable name
            });

            // The Edge Function now directly returns a non-2xx status for errors,
            // so 'error' object from invoke will contain the details if present.
            if (error) { 
                // error.context might contain the JSON response from the Edge Function on failure
                if (error.context && typeof error.context.json === 'function') {
                    try {
                        const errorData = await error.context.json();
                        if (errorData && errorData.message) {
                            formMessage.textContent = errorData.message;
                            if (errorData.limitReached) {
                                disableFormFields();
                            } else if (errorData.emailExists) {
                                // Message is already set from errorData.message
                                // e.g., "This email address has already been registered."
                            }
                        } else {
                            formMessage.textContent = 'An error occurred. Please try again.';
                        }
                    } catch (parseError) {
                        console.error('Error parsing function error response:', parseError);
                        formMessage.textContent = 'An unexpected error occurred. Please try again.';
                    }
                } else {
                    formMessage.textContent = error.message || 'An error occurred during signup. Please try again.';
                }
                formMessage.className = 'form-message error';
            } else if (data && data.success) {
                formMessage.textContent = data.message || 'Signup successful! Welcome aboard!';
                formMessage.className = 'form-message success';
                showThankYouModal();
                signupForm.reset();
                jobRoleSelect.disabled = true;
            } else if (data && data.error) { // Should be less common if errors are caught by the 'error' object above
                formMessage.textContent = data.message || 'An error occurred during signup.';
                formMessage.className = 'form-message error';
                if (data.limitReached) {
                    disableFormFields();
                } else if (data.emailExists) {
                    formMessage.textContent = data.message || 'This email address has already been registered.';
                }
            } else {
                // Fallback for unexpected response structure if no error and no success
                formMessage.textContent = 'An unexpected response was received. Please try again.';
                formMessage.className = 'form-message error';
            }


        } catch (error) {
            console.error('Error submitting form:', error);
            formMessage.textContent = `Error: ${error.message || 'Could not submit form. Please try again.'}`;
            if (error.message && error.message.toLowerCase().includes('limit')) {
                disableFormFields();
            }
            formMessage.className = 'form-message error';
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Sign Up Now';
        }
    });

    function showThankYouModal() {
        thankYouModal.style.display = 'block';
    }
function showDisclaimerModal() {
        disclaimerModal.style.display = "block";
    }
    closeModalButton.addEventListener("click", () => {
        thankYouModal.style.display = "none";
        showDisclaimerModal();
    });

    window.addEventListener("click", (event) => {
        if (event.target === thankYouModal) {
            thankYouModal.style.display = "none";
            showDisclaimerModal();
        } else if (event.target === disclaimerModal) {
            disclaimerModal.style.display = "none";
        }
    });

    disclaimerButton.addEventListener("click", () => {
        disclaimerModal.style.display = "none";
    });

    // Scroll Animation Logic
    const scrollElements = document.querySelectorAll('.animate-on-scroll');
