const sgMail = require('@sendgrid/mail');

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const sendVerificationEmail = async (email, code) => {
  try {
    console.log('Sending verification email to:', email);
    console.log('Verification code:', code);

    const msg = {
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@cartest.app',
      subject: 'Verify Your Email - Car Test',
      html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; max-width: 600px;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 40px 40px 20px 40px;">
              <h1 style="margin: 0; font-size: 28px; font-weight: bold; color: #333333; font-family: Arial, sans-serif;">
                Car Test
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <p style="margin: 0; font-size: 16px; line-height: 24px; color: #555555; font-family: Arial, sans-serif;">
                Hello,
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <p style="margin: 0; font-size: 16px; line-height: 24px; color: #555555; font-family: Arial, sans-serif;">
                Please use the following code to verify your email address:
              </p>
            </td>
          </tr>
          
          <!-- Code Box -->
          <tr>
            <td align="center" style="padding: 0 40px 30px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border: 2px solid #e0e0e0; border-radius: 6px;">
                <tr>
                  <td align="center" style="padding: 25px 40px;">
                    <span style="font-size: 32px; font-weight: bold; color: #333333; letter-spacing: 8px; font-family: 'Courier New', Courier, monospace;">
                      ${code}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 0 40px 10px 40px;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #777777; font-family: Arial, sans-serif;">
                This code will expire in 24 hours.
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #777777; font-family: Arial, sans-serif;">
                If you did not request this verification code, please disregard this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 30px 40px; background-color: #f8f9fa; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 5px 0; font-size: 14px; color: #333333; font-family: Arial, sans-serif;">
                Car Test
              </p>
              <p style="margin: 0; font-size: 12px; color: #999999; font-family: Arial, sans-serif;">
                &copy; 2025 Car Test. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
};

    await sgMail.send(msg);
    
    console.log('✅ Email sent successfully via SendGrid');
    
    return { 
      success: true
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