/**
 * Email service - Resend API
 * Sends transactional emails for top-up and purchase confirmations
 * Best-effort: skips if user has no email, never blocks main flow
 */

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || "RBX Community <support@muhwldns.me>";

/**
 * Send email (fire-and-forget, never throws)
 */
async function sendEmail({ to, subject, html }) {
  if (!to || !resend) {
    return null;
  }

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });
    return result;
  } catch (err) {
    console.warn("[email] Failed to send:", err.message);
    return null;
  }
}

/**
 * Base HTML template with violet theme
 */
function wrapTemplate(content) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#06040e;font-family:'Space Grotesk',sans-serif;color:#f4ecff;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;margin:0;background:linear-gradient(135deg,#8f5bff,#d35bff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">RBX Royale</h1>
      <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b7a8d8;margin:4px 0 0;">Scripts & Audio Tools</p>
    </div>

    <!-- Content -->
    <div style="background:rgba(17,12,35,0.82);border:1px solid rgba(193,121,255,0.22);border-radius:20px;padding:32px;box-shadow:0 18px 48px rgba(5,3,15,0.45);">
      ${content}
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;padding-top:24px;border-top:1px solid rgba(197,160,255,0.18);">
      <p style="font-size:12px;color:#b7a8d8;margin:0;">RBX Royale — Scripts, audio tools, and everything you need to build better Roblox games.</p>
      <p style="font-size:11px;color:#6b5b8a;margin:8px 0 0;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Format Rupiah
 */
function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

/**
 * Send top-up success email
 * @param {Object} user - User object with email
 * @param {number} amount - Top-up amount in Rupiah
 * @param {number} newBalance - New wallet balance
 */
export async function sendTopUpSuccessEmail(user, amount, newBalance) {
  if (!user?.email) return null;

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#8f5bff,#d35bff);line-height:56px;font-size:24px;text-align:center;">&#10003;</div>
    </div>
    <h2 style="font-size:20px;font-weight:600;text-align:center;margin:0 0 8px;color:#f4ecff;">Top Up Berhasil</h2>
    <p style="text-align:center;color:#b7a8d8;margin:0 0 24px;font-size:14px;">Saldo kamu telah ditambahkan.</p>

    <div style="background:rgba(127,87,255,0.12);border-radius:12px;padding:20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#b7a8d8;font-size:14px;">Jumlah Top Up</td>
          <td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#d35bff;">${formatRupiah(amount)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#b7a8d8;font-size:14px;">Saldo Baru</td>
          <td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#f4ecff;">${formatRupiah(newBalance)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;">
      <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/store" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#8f5bff,#d35bff);color:#0b0618;font-weight:600;font-size:14px;text-decoration:none;border-radius:999px;box-shadow:0 10px 18px rgba(142,92,255,0.28);">Browse Store</a>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject: `RBX Community — Top up ${formatRupiah(amount)} berhasil`,
    html: wrapTemplate(content),
  });
}

/**
 * Send purchase success email
 * @param {Object} user - User object with email
 * @param {Array} purchases - Purchase records
 * @param {Array} licenses - License records with keys
 * @param {number} totalCharged - Total amount charged
 * @param {number} newBalance - New wallet balance
 */
export async function sendPurchaseSuccessEmail(user, purchases, licenses, totalCharged, newBalance) {
  if (!user?.email) return null;

  const itemsHtml = licenses.map((license, i) => {
    const purchase = purchases[i];
    return `
      <div style="background:rgba(127,87,255,0.08);border:1px solid rgba(193,121,255,0.15);border-radius:12px;padding:16px;margin-bottom:12px;">
        <p style="font-size:14px;font-weight:600;color:#f4ecff;margin:0 0 8px;">${purchase.productName || "Script"}</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;color:#b7a8d8;font-size:12px;">License Type</td>
            <td style="padding:4px 0;text-align:right;color:#f4ecff;font-size:12px;">${license.licenseType}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#b7a8d8;font-size:12px;">License Key</td>
            <td style="padding:4px 0;text-align:right;font-family:monospace;color:#d35bff;font-size:12px;letter-spacing:0.5px;">${license.licenseKey}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#b7a8d8;font-size:12px;">Max Games</td>
            <td style="padding:4px 0;text-align:right;color:#f4ecff;font-size:12px;">${license.maxGames === null ? "Unlimited" : license.maxGames}</td>
          </tr>
        </table>
      </div>
    `;
  }).join("");

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#8f5bff,#d35bff);line-height:56px;font-size:24px;text-align:center;">&#127873;</div>
    </div>
    <h2 style="font-size:20px;font-weight:600;text-align:center;margin:0 0 8px;color:#f4ecff;">Purchase Berhasil!</h2>
    <p style="text-align:center;color:#b7a8d8;margin:0 0 24px;font-size:14px;">Berikut detail pembelian dan license key kamu.</p>

    ${itemsHtml}

    <div style="background:rgba(127,87,255,0.12);border-radius:12px;padding:16px;margin-top:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#b7a8d8;font-size:14px;">Total Charged</td>
          <td style="padding:6px 0;text-align:right;font-size:16px;font-weight:600;color:#d35bff;">${formatRupiah(totalCharged)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#b7a8d8;font-size:14px;">Saldo Tersisa</td>
          <td style="padding:6px 0;text-align:right;font-size:16px;font-weight:600;color:#f4ecff;">${formatRupiah(newBalance)}</td>
        </tr>
      </table>
    </div>

    <div style="margin-top:24px;padding:16px;background:rgba(127,87,255,0.06);border-radius:12px;border:1px solid rgba(193,121,255,0.12);">
      <p style="font-size:13px;font-weight:600;color:#f4ecff;margin:0 0 8px;">Next Steps:</p>
      <ol style="margin:0;padding-left:20px;color:#b7a8d8;font-size:13px;line-height:2;">
        <li>Buka Dashboard &rarr; My Licenses</li>
        <li>Whitelist game ID kamu</li>
        <li>Download script file</li>
        <li>Paste license key di script config</li>
      </ol>
    </div>

    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard/licenses" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#8f5bff,#d35bff);color:#0b0618;font-weight:600;font-size:14px;text-decoration:none;border-radius:999px;box-shadow:0 10px 18px rgba(142,92,255,0.28);">Manage Licenses</a>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject: `RBX Community — Purchase berhasil`,
    html: wrapTemplate(content),
  });
}
