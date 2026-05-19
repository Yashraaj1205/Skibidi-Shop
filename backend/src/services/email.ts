import nodemailer from 'nodemailer';
import { Order } from '../types';

const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';

// Configure Nodemailer with Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: smtpUser,
    pass: smtpPass
  }
});

// Helper function to get status progress bar HTML
function getProgressBarHTML(status: string): string {
  const isPending = status === 'pending';
  const isShipped = status === 'shipped';
  const isDelivered = status === 'delivered';

  return `
    <div style="margin: 24px 0; background: #334155; height: 8px; border-radius: 999px; position: relative; overflow: hidden;">
      <div style="background: linear-gradient(90deg, #60a5fa 0%, #c084fc 100%); height: 100%; width: ${isPending ? '33%' : isShipped ? '66%' : '100%'}; border-radius: 999px; transition: width 0.5s ease;"></div>
    </div>
    <table style="width: 100%; text-align: center; font-size: 12px; color: #94a3b8; font-weight: 600;">
      <tr>
        <td style="width: 33%; color: ${isPending || isShipped || isDelivered ? '#60a5fa' : '#94a3b8'};">Order Placed</td>
        <td style="width: 33%; color: ${isShipped || isDelivered ? '#c084fc' : '#94a3b8'};">Shipped</td>
        <td style="width: 33%; color: ${isDelivered ? '#10b981' : '#94a3b8'};">Delivered</td>
      </tr>
    </table>
  `;
}

// Generate full standard HTML template wrapper
function getEmailTemplate(title: string, customerName: string, bodyContent: string, order: Order): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Inter', -apple-system, sans-serif; -webkit-font-smoothing: antialiased;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" style="max-width: 600px; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
              <!-- Header -->
              <tr>
                <td style="background: rgba(15, 23, 42, 0.8); border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding: 24px 32px; text-align: center;">
                  <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; background: linear-gradient(90deg, #60a5fa, #c084fc); -webkit-background-clip: text; color: #60a5fa;">Apt Store</h1>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding: 32px; color: #cbd5e1; font-size: 15px; line-height: 24px;">
                  <p style="margin-top: 0; font-weight: 500; font-size: 16px; color: #f8fafc;">Hello ${customerName},</p>
                  ${bodyContent}
                  
                  <!-- Order Card -->
                  <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding-bottom: 8px; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Order ID</td>
                        <td align="right" style="padding-bottom: 8px; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Status</td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 16px; font-size: 16px; color: #f8fafc; font-weight: 700;">#${order.id}</td>
                        <td align="right" style="padding-bottom: 16px;">
                          <span style="font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; background: ${order.status === 'pending' ? 'rgba(245, 158, 11, 0.15)' : order.status === 'shipped' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${order.status === 'pending' ? '#fbbf24' : order.status === 'shipped' ? '#38bdf8' : '#34d399'}; border: 1px solid ${order.status === 'pending' ? 'rgba(245, 158, 11, 0.2)' : order.status === 'shipped' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(16, 185, 129, 0.2)'};">${order.status}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 16px; font-size: 14px; color: #94a3b8;">Product Purchased:</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="font-size: 16px; color: #f1f5f9; font-weight: 600; padding-top: 4px;">${order.product_name}</td>
                      </tr>
                    </table>
                  </div>

                  ${getProgressBarHTML(order.status)}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background: rgba(15, 23, 42, 0.8); border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b;">
                  <p style="margin: 0;">This is a real-time event-driven transaction email from your mock storefront.</p>
                  <p style="margin: 4px 0 0 0;">© ${new Date().getFullYear()} Apt Real-Time Systems Ltd.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export async function sendOrderConfirmationEmail(toEmail: string, order: Order): Promise<void> {
  if (!smtpUser || !smtpPass) {
    console.log('⚠️ SMTP credentials missing; skipping confirmation email.');
    return;
  }

  const title = `Order Confirmation #${order.id} — Apt Store`;
  const bodyContent = `
    <p>Thank you for shopping with us! We have received your order and are preparing it for shipment.</p>
    <p>You can track the progress of your order in real-time directly on your customer storefront panel.</p>
  `;

  try {
    await transporter.sendMail({
      from: `"Apt Store" <${smtpUser}>`,
      to: toEmail,
      subject: `🛍️ Order Confirmed! #${order.id} — Apt Store`,
      html: getEmailTemplate(title, order.customer_name, bodyContent, order)
    });
    console.log(`✉️ Order confirmation email sent to: ${toEmail}`);
  } catch (err) {
    console.error('Failed to send order confirmation email:', err);
  }
}

export async function sendOrderStatusUpdateEmail(toEmail: string, order: Order): Promise<void> {
  if (!smtpUser || !smtpPass) return;

  const isDelivered = order.status === 'delivered';
  const title = `Order #${order.id} Status Update — ${order.status.toUpperCase()}`;
  
  const bodyContent = isDelivered
    ? `<p>🎉 Great news! Your order has been successfully **delivered**. We hope you love your new product!</p>`
    : `<p>🚚 Good news! The status of your order has changed. It has been marked as **${order.status}** and is on its way to you.</p>`;

  const emoji = isDelivered ? '🎉' : '🚚';

  try {
    await transporter.sendMail({
      from: `"Apt Store" <${smtpUser}>`,
      to: toEmail,
      subject: `${emoji} Order #${order.id} Status Update: ${order.status.toUpperCase()}`,
      html: getEmailTemplate(title, order.customer_name, bodyContent, order)
    });
    console.log(`✉️ Status update email (${order.status}) sent to: ${toEmail}`);
  } catch (err) {
    console.error('Failed to send status update email:', err);
  }
}
