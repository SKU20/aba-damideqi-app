const nodemailer = require('nodemailer');

// Create SMTP transporter (works with Gmail, SMTP2GO, or any SMTP service)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

const sendVerificationEmail = async (email, code) => {
  try {
    console.log('Sending verification email to:', email);
    console.log('Verification code:', code);

    const mailOptions = {
      from: `"Car Test" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify Your Email - Car Test',
      html: `
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
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully');
    console.log('Message ID:', info.messageId);
    
    return { 
      success: true, 
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Email send error:', error);
    return { 
      success: false, 
      error: error.message
    };
  }
};

module.exports = { sendVerificationEmail };