import { loadEnvConfig } from "@next/env";
import { sendMail } from "../lib/mail";

/**
 * Envoie un e-mail de test avec la configuration SMTP de `.env.local`
 * (aucune base de données requise). Usage :
 *   npx tsx scripts/send-test-mail.ts adresse@exemple.com
 */
async function main() {
  loadEnvConfig(process.cwd());
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage : npx tsx scripts/send-test-mail.ts adresse@exemple.com");
    process.exit(2);
  }
  const result = await sendMail({
    to,
    subject: "SRH Ops — e-mail de test",
    text: "Cet e-mail confirme que l'envoi de messages depuis SRH Ops fonctionne.\n\nL'équipe SRH Ops",
  });
  console.log(result.ok ? "E-mail envoyé." : `Échec : ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}

void main();
