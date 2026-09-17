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

export async function sendEmail({ to, subject, body }: SendEmailOptions): Promise<boolean> {
  // En mode production, un transporteur SMTP (Nodemailer, SendGrid, Resend, etc.) sera configuré.
  // En développement / simulation, le mot de passe et l'email sont journalisés dans la console serveur.
  console.log("==========================================");
  console.log(`[EMAIL SERVICE] To: ${to}`);
  console.log(`[EMAIL SERVICE] Subject: ${subject}`);
  console.log(`[EMAIL SERVICE] Body:\n${body}`);
  console.log("==========================================");
  return true;
}
