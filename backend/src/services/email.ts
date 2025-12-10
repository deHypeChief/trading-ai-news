import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

/**
 * Initialize email transporter
 */
export function initEmailService() {
  try {
    if (transporter) return transporter;

    transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    console.log('✅ Email service initialized');
    return transporter;
  } catch (error) {
    console.error('❌ Email service initialization failed:', error);
    return null;
  }
}

/**
 * Send event alert email
 */
export async function sendEventAlertEmail(
  to: string,
  event: {
    eventName: string;
    currency: string;
    impact: string;
    eventDateTime: Date;
    aiRelevanceScore?: number;
    volatilityPrediction?: string;
    tradingRecommendation?: string;
  },
  minutesUntil: number
) {
  try {
    if (!transporter) {
      transporter = initEmailService();
    }

    if (!transporter) {
      throw new Error('Email service not available');
    }

    const timeString = event.eventDateTime.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .event-card { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .badge-high { background: #fee2e2; color: #991b1b; }
    .badge-medium { background: #fed7aa; color: #9a3412; }
    .badge-low { background: #d1fae5; color: #065f46; }
    .score { font-size: 32px; font-weight: bold; color: #667eea; }
    .recommendation { background: #eff6ff; padding: 15px; border-radius: 6px; border-left: 3px solid #3b82f6; margin: 15px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">⚡ Economic Event Alert</h1>
      <p style="margin: 5px 0 0 0;">Smart Money Calendar</p>
    </div>
    
    <div class="content">
      <p style="font-size: 16px; margin-bottom: 20px;">
        <strong>Upcoming in ${minutesUntil} minutes!</strong>
      </p>
      
      <div class="event-card">
        <h2 style="margin-top: 0; color: #1f2937;">${event.eventName}</h2>
        
        <div style="margin: 15px 0;">
          <span class="badge badge-${event.impact.toLowerCase()}">${event.impact} Impact</span>
          <span class="badge" style="background: #e5e7eb; color: #374151;">${event.currency}</span>
          ${event.volatilityPrediction ? `<span class="badge" style="background: #fef3c7; color: #92400e;">${event.volatilityPrediction} Volatility</span>` : ''}
        </div>
        
        <p style="margin: 10px 0;">
          <strong>📅 Time:</strong> ${timeString}
        </p>
        
        ${event.aiRelevanceScore ? `
        <div style="margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">AI Relevance Score</p>
          <div class="score">${event.aiRelevanceScore}/100</div>
        </div>
        ` : ''}
        
        ${event.tradingRecommendation ? `
        <div class="recommendation">
          <p style="margin: 0; font-weight: bold; color: #1e40af; margin-bottom: 8px;">💡 Trading Recommendation:</p>
          <p style="margin: 0; color: #1f2937;">${event.tradingRecommendation}</p>
        </div>
        ` : ''}
      </div>
      
      <p style="text-align: center; margin-top: 20px;">
        <a href="http://localhost:3000/calendar" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View Full Calendar
        </a>
      </p>
    </div>
    
    <div class="footer">
      <p>You're receiving this because you have alerts enabled for this event.</p>
      <p><a href="http://localhost:3000/settings" style="color: #667eea;">Manage Alert Settings</a></p>
    </div>
  </div>
</body>
</html>
    `;

    const result = await transporter.sendMail({
      from: `"Smart Money Calendar" <${process.env.SMTP_USER}>`,
      to,
      subject: `🔔 Alert: ${event.eventName} in ${minutesUntil} minutes`,
      html,
    });

    console.log(`📧 Alert email sent to ${to}:`, result.messageId);
    return result;
  } catch (error: any) {
    console.error('Failed to send alert email:', error.message);
    throw error;
  }
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(to: string, username: string) {
  try {
    if (!transporter) {
      transporter = initEmailService();
    }

    if (!transporter) {
      throw new Error('Email service not available');
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
    .feature { background: white; padding: 15px; border-radius: 6px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 32px;">Welcome to Smart Money Calendar! 🎉</h1>
    </div>
    
    <div class="content">
      <p style="font-size: 18px;">Hi ${username},</p>
      
      <p>Thank you for joining Smart Money Calendar – your AI-powered economic calendar for smarter trading decisions!</p>
      
      <h3 style="color: #667eea;">What You Can Do Now:</h3>
      
      <div class="feature">
        <strong>📊 AI Economic Calendar</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280;">View economic events with AI relevance scores and volatility predictions</p>
      </div>
      
      <div class="feature">
        <strong>🔔 Smart Alerts</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280;">Get notified before high-impact events that matter to your trading</p>
      </div>
      
      <div class="feature">
        <strong>🧮 Position Calculator</strong>
        <p style="margin: 5px 0 0 0; color: #6b7280;">Calculate optimal position sizes with volatility adjustments</p>
      </div>
      
      <div style="text-align: center;">
        <a href="http://localhost:3000/dashboard" class="button">Go to Your Dashboard</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        Need help? Reply to this email or visit our support page.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const result = await transporter.sendMail({
      from: `"Smart Money Calendar" <${process.env.SMTP_USER}>`,
      to,
      subject: '🎉 Welcome to Smart Money Calendar!',
      html,
    });

    console.log(`📧 Welcome email sent to ${to}:`, result.messageId);
    return result;
  } catch (error: any) {
    console.error('Failed to send welcome email:', error.message);
    throw error;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(to: string, resetToken: string) {
  try {
    if (!transporter) {
      transporter = initEmailService();
    }

    if (!transporter) {
      throw new Error('Email service not available');
    }

    const resetUrl = `http://localhost:3000/reset-password?token=${resetToken}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
    .warning { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🔐 Password Reset Request</h1>
    </div>
    
    <div class="content">
      <p>We received a request to reset your password for your Smart Money Calendar account.</p>
      
      <div style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Your Password</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
      <p style="color: #667eea; font-size: 12px; word-break: break-all;">${resetUrl}</p>
      
      <div class="warning">
        <p style="margin: 0; font-weight: bold; color: #991b1b;">⚠️ Important:</p>
        <p style="margin: 5px 0 0 0; color: #7f1d1d;">This link will expire in 1 hour. If you didn't request this reset, please ignore this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const result = await transporter.sendMail({
      from: `"Smart Money Calendar" <${process.env.SMTP_USER}>`,
      to,
      subject: '🔐 Reset Your Password - Smart Money Calendar',
      html,
    });

    console.log(`📧 Password reset email sent to ${to}:`, result.messageId);
    return result;
  } catch (error: any) {
    console.error('Failed to send password reset email:', error.message);
    throw error;
  }
}

/**
 * Test email configuration
 */
export async function testEmailService(): Promise<boolean> {
  try {
    if (!transporter) {
      transporter = initEmailService();
    }

    if (!transporter) {
      return false;
    }

    await transporter.verify();
    console.log('✅ Email service is ready');
    return true;
  } catch (error: any) {
    console.error('❌ Email service test failed:', error.message);
    return false;
  }
}
