import nodemailer from "nodemailer";

function smtpConfig() {
  const user = process.env.GMAIL_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD || process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 465);
  if (!user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    user,
    from: process.env.SMTP_FROM || user,
    transport: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE.toLowerCase() === "true" : port === 465,
      auth: { user, pass }
    }
  };
}

export function emailDeliveryConfigured() {
  return smtpConfig() !== null;
}

export async function sendPortalEmail(message: { to: string; subject: string; text: string }) {
  const config = smtpConfig();
  if (!config) throw new Error("EMAIL_NOT_CONFIGURED");
  const transporter = nodemailer.createTransport(config.transport);
  await transporter.sendMail({ from: config.from, ...message });
}

export async function verifyPortalEmailConnection() {
  const config = smtpConfig();
  if (!config) return false;
  const transporter = nodemailer.createTransport(config.transport);
  await transporter.verify();
  return true;
}
