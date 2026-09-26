import type { MailMessage } from "@/backend/platform/email/types";

interface Recipient {
  nom: string;
  email: string;
}

const SIGNATURE = "L'équipe SRH Ops";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(paragraphs: string[], link?: { href: string; label: string }): string {
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  const button = link
    ? `<p><a href="${escapeHtml(link.href)}" style="display:inline-block;padding:10px 18px;background:#0d631b;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(link.label)}</a></p><p style="font-size:12px;color:#555">Ou copiez ce lien : ${escapeHtml(link.href)}</p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">${body}${button}<p>${SIGNATURE}</p></div>`;
}

export function buildResetMail(user: Recipient, link: string): MailMessage {
  const lines = [
    `Bonjour ${user.nom},`,
    "Vous avez demandé la réinitialisation de votre mot de passe SRH Ops.",
    "Ce lien est valable 30 minutes et ne peut servir qu'une fois.",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
  ];
  return {
    to: user.email,
    subject: "SRH Ops — Réinitialisation de votre mot de passe",
    text: `${lines.join("\n\n")}\n\n${link}\n\n${SIGNATURE}`,
    html: html(lines, { href: link, label: "Choisir un nouveau mot de passe" }),
  };
}

export function buildInvitationMail(user: Recipient, link: string): MailMessage {
  const lines = [
    `Bonjour ${user.nom},`,
    "Un compte SRH Ops vient de vous être créé. Pour l'activer, choisissez votre mot de passe.",
    "Ce lien est valable 72 heures et ne peut servir qu'une fois. S'il expire, demandez un nouveau lien à votre administrateur.",
  ];
  return {
    to: user.email,
    subject: "SRH Ops — Activez votre compte",
    text: `${lines.join("\n\n")}\n\n${link}\n\n${SIGNATURE}`,
    html: html(lines, { href: link, label: "Activer mon compte" }),
  };
}

export function buildPasswordChangedMail(user: Recipient): MailMessage {
  const lines = [
    `Bonjour ${user.nom},`,
    "Le mot de passe de votre compte SRH Ops vient d'être modifié.",
    "Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement un administrateur SRH.",
  ];
  return {
    to: user.email,
    subject: "SRH Ops — Votre mot de passe a été modifié",
    text: `${lines.join("\n\n")}\n\n${SIGNATURE}`,
    html: html(lines),
  };
}
