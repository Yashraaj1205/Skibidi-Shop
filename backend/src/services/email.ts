import nodemailer from 'nodemailer';
import { Order } from '../types';

const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: smtpUser, pass: smtpPass }
});

function progressHTML(status: string): string {
  const pct = status === 'pending' ? '33%' : status === 'shipped' ? '66%' : '100%';
  const c = (s: string, active: boolean) => active ? '#00ff88' : '#555';
  const pending = true;
  const shipped = status === 'shipped' || status === 'delivered';
  const delivered = status === 'delivered';

  return `
    <div style="margin:24px 0;background:#222;height:8px;border-radius:99px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#00ff88,#7c3aed);height:100%;width:${pct};border-radius:99px;"></div>
    </div>
    <table style="width:100%;text-align:center;font-size:12px;font-weight:600;">
      <tr>
        <td style="color:${c('pending', pending)};">Ordered</td>
        <td style="color:${c('shipped', shipped)};">Shipped</td>
        <td style="color:${c('delivered', delivered)};">Delivered</td>
      </tr>
    </table>
  `;
}

function template(title: string, name: string, body: string, order: Order): string {
  const statusColor = order.status === 'pending' ? '#eab308' : order.status === 'shipped' ? '#38bdf8' : '#00ff88';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,sans-serif;">
<table width="100%" style="background:#0a0a0a;padding:40px 20px;"><tr><td align="center">
<table width="100%" style="max-width:560px;background:#141414;border:1px solid #222;border-radius:16px;overflow:hidden;">
  <tr><td style="background:#111;border-bottom:1px solid #222;padding:24px 32px;text-align:center;">
    <h1 style="margin:0;font-size:22px;font-weight:800;color:#00ff88;">SKIBIDI SHOP</h1>
  </td></tr>
  <tr><td style="padding:32px;color:#ccc;font-size:15px;line-height:24px;">
    <p style="margin:0 0 16px;font-weight:600;font-size:16px;color:#fff;">Hey ${name},</p>
    ${body}
    <div style="background:#1a1a1a;border:1px solid #222;border-radius:12px;padding:20px;margin:24px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:11px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Order</td>
          <td align="right" style="font-size:11px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Status</td>
        </tr>
        <tr>
          <td style="padding-top:6px;font-size:18px;color:#fff;font-weight:700;">#${order.id}</td>
          <td align="right" style="padding-top:6px;">
            <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;text-transform:uppercase;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}33;">${order.status}</span>
          </td>
        </tr>
        <tr><td colspan="2" style="border-top:1px solid #222;padding-top:14px;margin-top:14px;font-size:13px;color:#888;">Product</td></tr>
        <tr><td colspan="2" style="font-size:16px;color:#fff;font-weight:600;padding-top:4px;">${order.product_name}</td></tr>
      </table>
    </div>
    ${progressHTML(order.status)}
  </td></tr>
  <tr><td style="background:#111;border-top:1px solid #222;padding:20px 32px;text-align:center;font-size:12px;color:#555;">
    <p style="margin:0;">Skibidi Shop — Real-Time Order System</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

export async function sendOrderConfirmationEmail(toEmail: string, order: Order): Promise<void> {
  if (!smtpUser || !smtpPass) return;

  try {
    await transporter.sendMail({
      from: `"Skibidi Shop" <${smtpUser}>`,
      to: toEmail,
      subject: `Order Confirmed #${order.id} — Skibidi Shop`,
      html: template(
        `Order #${order.id} Confirmed`,
        order.customer_name,
        '<p>Your order has been placed successfully! We\'re preparing it for shipment. Track your order in real-time on the storefront.</p>',
        order
      )
    });
    console.log(`Email sent to ${toEmail} (confirmation)`);
  } catch (err) {
    console.error('Email failed:', err);
  }
}

export async function sendOrderStatusUpdateEmail(toEmail: string, order: Order): Promise<void> {
  if (!smtpUser || !smtpPass) return;

  const msg = order.status === 'delivered'
    ? '<p>Your order has been delivered! Hope you love it.</p>'
    : `<p>Your order status has been updated to <strong>${order.status}</strong>. It's on the way!</p>`;

  const emoji = order.status === 'delivered' ? '🎉' : '🚚';

  try {
    await transporter.sendMail({
      from: `"Skibidi Shop" <${smtpUser}>`,
      to: toEmail,
      subject: `${emoji} Order #${order.id}: ${order.status.toUpperCase()} — Skibidi Shop`,
      html: template(`Order #${order.id} ${order.status}`, order.customer_name, msg, order)
    });
    console.log(`Email sent to ${toEmail} (${order.status})`);
  } catch (err) {
    console.error('Email failed:', err);
  }
}
