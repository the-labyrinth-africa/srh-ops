import crypto from "crypto";

export function generateRandomPassword(length = 10): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return password;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
}

export async function sendEmail({ to, subject }: SendEmailOptions): Promise<boolean> {
  // En production, un transporteur SMTP (Nodemailer, SendGrid, Resend, etc.) sera configuré.
  // Le corps du message n'est jamais journalisé : il contient des secrets
  // (mots de passe temporaires). Seuls le destinataire et l'objet le sont.
  console.log(`[EMAIL SERVICE] To: ${to} — Subject: ${subject}`);
  return true;
}
