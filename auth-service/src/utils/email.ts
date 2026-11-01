import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  const isSmtpConfigured = process.env.EMAIL_USER && process.env.EMAIL_PASS;

  if (!isSmtpConfigured) {
    console.log(`[MOCK EMAIL SENT]
      To: ${options.to}
      Subject: ${options.subject}
      Body: ${options.text}
      HTML-Available: ${!!options.html}
    `);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
      port: parseInt(process.env.EMAIL_PORT || '2525', 10),
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@ecommerce.com',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${options.to}: MessageId: ${info.messageId}`);
  } catch (error) {
    console.error(`❌ Error sending email to ${options.to}:`, error);
  }
};

export const sendVerificationEmail = async (email: string, name: string, token: string): Promise<void> => {
  // Link to the storefront page, which confirms the token with the API and shows the result
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
  
  await sendEmail({
    to: email,
    subject: 'Welcome! Please verify your email',
    text: `Hi ${name},\n\nPlease verify your email by clicking on the link below:\n\n${verificationUrl}\n\nThank you!`,
    html: `
      <h2>Hi ${name},</h2>
      <p>Please click the link below to verify your email address and activate your account:</p>
      <a href="${verificationUrl}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
};

export const sendPasswordResetEmail = async (email: string, name: string, token: string): Promise<void> => {
  // Resetting needs a form for the new password, so link to the storefront page rather than the API
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

  await sendEmail({
    to: email,
    subject: 'Password Reset Request',
    text: `Hi ${name},\n\nYou requested a password reset. Please click on the link below to reset your password:\n\n${resetUrl}\n\nThis link is valid for 1 hour.`,
    html: `
      <h2>Hi ${name},</h2>
      <p>You requested a password reset. Please click the button below to set a new password:</p>
      <a href="${resetUrl}" style="padding: 10px 20px; background-color: #f44336; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
      <p>This link is valid for 1 hour. If you did not request this, please contact support immediately.</p>
    `,
  });
};
