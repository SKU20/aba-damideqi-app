const SibApiV3Sdk = require('@getbrevo/brevo');

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

const sendVerificationEmail = async (email, code) => {
  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = { name: 'Car Test', email: 'cartests2025@gmail.com' };
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.subject = 'Verify Your Email - Car Test';
    sendSmtpEmail.htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 40px 20px;">
                        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px; text-align: center;">
                                    <h1 style="margin: 0 0 20px 0; font-size: 24px; color: #111827;">Verify Your Email</h1>
                                    <p style="margin: 0 0 30px 0; font-size: 16px; color: #374151;">
                                        Enter this code in the app to verify your email:
                                    </p>
                                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; border: 2px solid #e5e7eb;">
                                        <p style="margin: 0; font-size: 36px; font-weight: 700; color: #111827; letter-spacing: 10px; font-family: 'Courier New', monospace;">
                                            ${code}
                                        </p>
                                    </div>
                                    <p style="margin: 30px 0 0 0; font-size: 14px; color: #6b7280;">
                                        Code expires in 24 hours
                                    </p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 30px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
                                    <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">Car Test</p>
                                    <p style="margin: 5px 0 0 0; font-size: 12px; color: #9ca3af;">© 2025 Car Test. All rights reserved.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
      `;

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    return { success: true, data };
  } catch (error) {
    console.error('Brevo email send error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendVerificationEmail };
