import { describe, it, expect } from "vitest";
import { buildResetMail, buildInvitationMail, buildPasswordChangedMail } from "@/lib/auth/account-mail";

const user = { nom: "Awa Koné", email: "awa@srh.ci" };
const link = "https://ops.srh.ci/reset-password?token=TOKEN123";

describe("gabarits d'e-mails de compte", () => {
  it("réinitialisation : destinataire, lien, durée de validité, aucun mot de passe", () => {
    const m = buildResetMail(user, link);
    expect(m.to).toBe("awa@srh.ci");
    expect(m.subject).toContain("SRH Ops");
    expect(m.text).toContain(link);
    expect(m.text).toContain("30 minutes");
    expect(m.html).toContain(link);
    expect(m.text).toContain("Awa Koné");
    expect(m.text.toLowerCase()).not.toContain("mot de passe temporaire :");
  });
  it("invitation : lien et durée de 72 heures", () => {
    const m = buildInvitationMail(user, link);
    expect(m.text).toContain(link);
    expect(m.text).toContain("72 heures");
  });
  it("mot de passe modifié : pas de lien, conseille de contacter SRH si ce n'est pas l'utilisateur", () => {
    const m = buildPasswordChangedMail(user);
    expect(m.text).not.toContain("http");
    expect(m.text).toContain("Si vous n'êtes pas à l'origine");
  });
  it("échappe le HTML du nom", () => {
    const m = buildResetMail({ nom: "<b>X</b>", email: "x@srh.ci" }, link);
    expect(m.html).not.toContain("<b>X</b>");
    expect(m.html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});
