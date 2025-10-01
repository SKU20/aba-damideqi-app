const SibApiV3Sdk = require('@getbrevo/brevo');

let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Set API key
let apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const sendVerificationEmail = async (email, code) => {
  try {
    // Log for debugging
    console.log('Sending verification email to:', email);
    console.log('Verification code:', code);
    console.log('API Key present:', !!process.env.BREVO_API_KEY);

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    
    // Sender details - MUST be verified in Brevo dashboard
    sendSmtpEmail.sender = { 
      name: 'Car Test', 
      email: 'cartests2025@gmail.com' 
    };
    
    // Recipient
    sendSmtpEmail.to = [{ email: email }];
    
    // Subject
    sendSmtpEmail.subject = 'Verify Your Email - Car Test';
    
    // HTML content
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
                            <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af;">
                                If you didn't request this code, please ignore this email.
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

    // Send the email
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Email sent successfully');
    console.log('Message ID:', data.messageId);
    
    return { 
      success: true, 
      messageId: data.messageId,
      data 
    };
    
  } catch (error) {
    console.error('❌ Brevo email send error:', error);
    
    // Log detailed error information
    if (error.response) {
      console.error('Error status:', error.response.status);
      console.error('Error body:', error.response.body);
    }
    
    return { 
      success: false, 
      error: error.message,
      details: error.response?.body 
    };
  }
};

// Test function to verify setup
const testBrevoConnection = async () => {
  try {
    const accountApi = new SibApiV3Sdk.AccountApi();
    const account = await accountApi.getAccount();
    
    console.log('✅ Brevo connection successful');
    console.log('Account email:', account.email);
    console.log('Plan:', account.plan);
    
    return { success: true, account };
  } catch (error) {
    console.error('❌ Brevo connection failed:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { 
  sendVerificationEmail,
  testBrevoConnection 
};