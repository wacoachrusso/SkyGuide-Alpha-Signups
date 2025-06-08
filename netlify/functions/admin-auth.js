const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
    const adminPassword = process.env.ADMIN_PASSWORD;

    const serveLoginForm = (errorMessage = '') => {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Admin Login</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background-color: #f4f7f6; margin: 0; }
                        .login-container { background-color: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; width: 320px; }
                        h1 { color: #333; margin-bottom: 20px; font-size: 1.5em; }
                        label { display: block; margin-bottom: 8px; color: #555; font-weight: bold; text-align: left; }
                        input[type="password"] { width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
                        button { background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
                        button:hover { background-color: #0056b3; }
                        .error-message { color: red; margin-bottom: 15px; font-size: 0.9em; }
                    </style>
                </head>
                <body>
                    <div class="login-container">
                        <h1>Admin Access</h1>
                        ${errorMessage ? `<p class="error-message">${errorMessage}</p>` : ''}
                        <form method="POST" action="">
                            <label for="password">Password:</label>
                            <input type="password" id="password" name="password" required autofocus>
                            <button type="submit">Login</button>
                        </form>
                    </div>
                </body>
                </html>
            `,
        };
    };

    if (event.httpMethod === 'POST') {
        let submittedPassword = '';
        if (event.body) {
            try {
                // For Netlify functions, the body is a string, need to parse it if it's form-urlencoded
                const params = new URLSearchParams(event.body);
                submittedPassword = params.get('password');
            } catch (e) {
                console.error('Error parsing POST body:', e);
                return serveLoginForm('An error occurred. Please try again.');
            }
        }

        if (submittedPassword && submittedPassword === adminPassword) {
            try {
                // Path to your actual admin page (admin/index.html)
                // The function is in netlify/functions/admin-auth.js
                // So, ../../../admin/index.html should go up to the project root, then into admin/
                let adminHtmlContent = '';
                let successfullyReadPreferredFile = false;

                try {
                    const preferredAdminHtmlPath = path.resolve('admin.html');
                    console.log('Attempting to read preferred admin file:', preferredAdminHtmlPath);
                    adminHtmlContent = fs.readFileSync(preferredAdminHtmlPath, 'utf8');
                    successfullyReadPreferredFile = true;
                    console.log('Successfully read preferred admin.html');
                } catch (readError) {
                    console.error('Failed to read preferred admin.html:', readError);
                    // Fallback to try reading the other admin page for diagnostics
                    try {
                        const fallbackAdminHtmlPath = path.resolve('_admin_content/index.html'); // Assuming it's at root/_admin_content/
                        console.log('Attempting to read fallback _admin_content/index.html:', fallbackAdminHtmlPath);
                        adminHtmlContent = fs.readFileSync(fallbackAdminHtmlPath, 'utf8');
                        console.log('Successfully read fallback _admin_content/index.html. THIS IS NOT THE INTENDED FILE.');
                    } catch (fallbackReadError) {
                        console.error('Failed to read fallback _admin_content/index.html as well:', fallbackReadError);
                        throw new Error('Neither admin page could be read.'); // This will be caught by the outer catch block
                    }
                }

                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'text/html' },
                    body: adminHtmlContent, // Will be either preferred or fallback, or outer catch if both fail
                };
            } catch (error) {
                console.error("Error reading admin page:", error);
                return {
                    statusCode: 500,
                    headers: { 'Content-Type': 'text/html' },
                    body: "<h1>Internal Server Error</h1><p>Could not load admin page. Check function logs in Netlify.</p>",
                };
            }
        } else {
            return serveLoginForm("Incorrect password. Please try again.");
        }
    }

    // If not POST, or any other case, serve the login form
    return serveLoginForm();
};