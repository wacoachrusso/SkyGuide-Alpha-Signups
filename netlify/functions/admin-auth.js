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
                let adminHtmlContentToServe = '';
                let preferredPathTried = '';
                let fallbackPathTried = '';
                let specificReadError = null;

                try {
                    const preferredAdminHtmlPath = path.resolve('admin.html');
                    preferredPathTried = preferredAdminHtmlPath;
                    console.log('Attempting to read preferred admin file:', preferredAdminHtmlPath);
                    adminHtmlContentToServe = fs.readFileSync(preferredAdminHtmlPath, 'utf8');
                    console.log('Successfully read preferred admin.html');
                } catch (readError) {
                    console.error('Failed to read preferred admin.html:', preferredPathTried, readError);
                    specificReadError = readError; // Save the first error

                    // Fallback to try reading the other admin page
                    try {
                        const fallbackAdminHtmlPath = path.resolve('_admin_content/index.html');
                        fallbackPathTried = fallbackAdminHtmlPath;
                        console.log('Attempting to read fallback _admin_content/index.html:', fallbackAdminHtmlPath);
                        adminHtmlContentToServe = fs.readFileSync(fallbackAdminHtmlPath, 'utf8');
                        console.log('Successfully read fallback _admin_content/index.html. THIS IS NOT THE INTENDED FILE.');
                        
                        const diagnosticHeader = `
                            <div style="background-color: #ffdddd; border: 1px solid #ff0000; color: #d8000c; padding: 15px; margin-bottom: 20px; text-align: left; font-family: monospace; font-size: 14px; position: sticky; top: 0; z-index: 9999;">
                                <strong>DIAGNOSTIC INFO:</strong> Displaying fallback admin page because the preferred page could not be loaded.<br>
                                Intended page: admin.html<br>
                                Attempted path for admin.html: ${preferredPathTried || 'Not attempted'}<br>
                                Error reading admin.html: ${specificReadError ? specificReadError.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'N/A'}<br>
                                Currently displaying: _admin_content/index.html (Path: ${fallbackPathTried || 'Not attempted'})
                            </div>`;
                        adminHtmlContentToServe = diagnosticHeader + adminHtmlContentToServe;

                    } catch (fallbackReadError) {
                        console.error('Failed to read fallback _admin_content/index.html as well:', fallbackPathTried, fallbackReadError);
                        // Construct a detailed error message if both fail
                        let combinedErrorMessage = `Neither admin page could be read.\
Preferred path ('admin.html'): ${preferredPathTried || 'Not attempted'}. Error: ${specificReadError ? specificReadError.toString() : 'N/A'}.\
Fallback path ('_admin_content/index.html'): ${fallbackPathTried || 'Not attempted'}. Error: ${fallbackReadError.toString()}`;
                        throw new Error(combinedErrorMessage);
                    }
                }

                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'text/html' },
                    body: adminHtmlContentToServe,
                };

            } catch (error) { // This is the outer catch for critical errors or if both reads fail
                console.error("Critical error serving admin page:", error);
                const detailedErrorMessage = (error.message || "Could not load admin page.").replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                return {
                    statusCode: 500,
                    headers: { 'Content-Type': 'text/html' },
                    body: `<h1>Internal Server Error</h1>
                           <p>Could not load the admin page. Details below:</p>
                           <p style="color:red; font-family:monospace; border:1px solid red; padding:10px; background-color:#ffebeb;"><strong>Error Details:</strong><br>${detailedErrorMessage}</p>
                           <p>Please check the Netlify function logs for more context if possible.</p>`,
                };
            }
        } else {
            return serveLoginForm("Incorrect password. Please try again.");
        }
    }

    // If not POST, or any other case, serve the login form
    return serveLoginForm();
};