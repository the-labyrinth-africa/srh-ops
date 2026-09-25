import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { JetonRepositoryMongoose } from "./jeton.repository.mongoose";
import { PasswordResetToken } from "./jeton.model";

const depot = new JetonRepositoryMongoose();
const uid = () => String(new mongoose.Types.ObjectId());
const T0 = new Date(Date.UTC(2026, 8, 20, 10, 0, 0));

describe("JetonRepositoryMongoose (contrat)", () => {
  describe("emettre", () => {
    it("génère un jeton de 43 caractères et ne stocke que son empreinte (jamais le jeton en clair)", async () => {
      const userId = uid();
      const { token, expiresAt } = await depot.emettre(userId, "reset", T0);

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(expiresAt.getTime()).toBe(T0.getTime() + 30 * 60 * 1000);

      const docs = await PasswordResetToken.find().lean();
      expect(docs).toHaveLength(1);
      expect(docs[0].tokenHash).not.toBe(token);
      expect(JSON.stringify(docs[0])).not.toContain(token);
      expect(docs[0].purpose).toBe("reset");
    });

    it("l'invitation vaut 72 heures", async () => {
      const { expiresAt } = await depot.emettre(uid(), "invitation", T0);
      expect(expiresAt.getTime()).toBe(T0.getTime() + 72 * 3_600_000);
    });

    it("un seul jeton actif par (utilisateur, finalité) : émettre deux fois invalide le premier", async () => {
      const userId = uid();
      const premier = await depot.emettre(userId, "reset", T0);
      const second = await depot.emettre(userId, "reset", T0);

      expect(await PasswordResetToken.countDocuments({ userId, purpose: "reset" })).toBe(1);
      expect(await depot.consommer(premier.token, T0)).toBeNull();
      expect(await depot.consommer(second.token, T0)).toEqual({ userId, finalite: "reset" });
    });

    it("émettre un jeton `reset` n'affecte pas une invitation en attente du même utilisateur, et réciproquement", async () => {
      const userId = uid();
      const invitation = await depot.emettre(userId, "invitation", T0);
      const reset = await depot.emettre(userId, "reset", T0);

      expect(await PasswordResetToken.countDocuments({ userId, usedAt: null })).toBe(2);
      expect(await depot.consommer(invitation.token, T0)).toEqual({ userId, finalite: "invitation" });
      expect(await depot.consommer(reset.token, T0)).toEqual({ userId, finalite: "reset" });
    });

    it("n'affecte jamais les jetons d'un autre utilisateur", async () => {
      const a = uid();
      const b = uid();
      const deA = await depot.emettre(a, "reset", T0);
      const deB = await depot.emettre(b, "reset", T0);
      await depot.emettre(a, "reset", T0); // ré-émission pour a : ne doit pas toucher b

      expect(await depot.consommer(deB.token, T0)).toEqual({ userId: b, finalite: "reset" });
      expect(await depot.consommer(deA.token, T0)).toBeNull();
    });

    it("refuse un userId qui n'est pas un ObjectId valide, sans rien supprimer", async () => {
      const victime = uid();
      const conserve = await depot.emettre(victime, "reset", T0);

      const invalides: unknown[] = [{ $ne: null }, "pas-un-objectid", "", null, undefined, 42, [victime]];
      for (const valeur of invalides) {
        await expect(depot.emettre(valeur as string, "reset", T0)).rejects.toThrow("userId invalide");
      }

      expect(await PasswordResetToken.countDocuments()).toBe(1);
      expect(await depot.consommer(conserve.token, T0)).toEqual({ userId: victime, finalite: "reset" });
    });
  });

  describe("consommer", () => {
    it("ne sert qu'une seule fois", async () => {
      const userId = uid();
      const { token } = await depot.emettre(userId, "reset", T0);
      expect(await depot.consommer(token, T0)).toEqual({ userId, finalite: "reset" });
      expect(await depot.consommer(token, T0)).toBeNull();
    });

    it("refuse un jeton expiré (à la milliseconde près)", async () => {
      const { token, expiresAt } = await depot.emettre(uid(), "reset", T0);
      expect(await depot.consommer(token, new Date(expiresAt.getTime() + 1))).toBeNull();
    });

    it("accepte un jeton juste avant son expiration", async () => {
      const userId = uid();
      const { token, expiresAt } = await depot.emettre(userId, "reset", T0);
      expect(await depot.consommer(token, new Date(expiresAt.getTime() - 1))).toEqual({ userId, finalite: "reset" });
    });

    it("refuse un jeton inconnu ou mal formé sans lever, sans requête base", async () => {
      expect(await depot.consommer("", T0)).toBeNull();
      expect(await depot.consommer("court", T0)).toBeNull();
      expect(await depot.consommer("a".repeat(43), T0)).toBeNull();
      expect(await depot.consommer("{$ne:null}".padEnd(43, "x"), T0)).toBeNull();
    });

    it("refuse tout jeton qui n'est pas une chaîne (objet d'opérateur, tableau, null) sans rien consommer", async () => {
      const { token } = await depot.emettre(uid(), "reset", T0);
      const invalides: unknown[] = [{ $ne: null }, ["a".repeat(43)], [token], null, undefined, 42];
      for (const valeur of invalides) {
        expect(await depot.consommer(valeur as string, T0)).toBeNull();
      }
      expect(await PasswordResetToken.countDocuments({ usedAt: null })).toBe(1);
    });

    it("est atomique : deux consommations concurrentes, une seule réussit", async () => {
      const userId = uid();
      const { token } = await depot.emettre(userId, "reset", T0);
      const resultats = await Promise.all([depot.consommer(token, T0), depot.consommer(token, T0)]);
      const gagnants = resultats.filter(Boolean);
      expect(gagnants).toHaveLength(1);
      expect(gagnants[0]).toEqual({ userId, finalite: "reset" });
      expect(await PasswordResetToken.countDocuments({ usedAt: { $ne: null } })).toBe(1);
    });

    it("le jeton consommé reste en base (traçabilité) avec usedAt renseigné", async () => {
      const { token } = await depot.emettre(uid(), "reset", T0);
      await depot.consommer(token, T0);
      const doc = await PasswordResetToken.findOne().lean<{ usedAt: Date | null }>();
      expect(doc?.usedAt).toBeInstanceOf(Date);
    });
  });

  describe("revoquerEnAttente", () => {
    it("supprime uniquement les jetons non consommés (usedAt: null) de l'utilisateur visé", async () => {
      const userId = uid();
      const autre = uid();
      const consomme = await depot.emettre(userId, "invitation", T0);
      await depot.consommer(consomme.token, T0);
      const enAttente = await depot.emettre(userId, "reset", T0);
      const deAutre = await depot.emettre(autre, "reset", T0);

      await depot.revoquerEnAttente(userId);

      // Le jeton consommé (usedAt renseigné) n'est pas supprimé — seule la trace en attente l'est.
      expect(await PasswordResetToken.countDocuments({ userId })).toBe(1);
      expect(await depot.consommer(enAttente.token, T0)).toBeNull();
      expect(await depot.consommer(deAutre.token, T0)).toEqual({ userId: autre, finalite: "reset" });
    });

    it("ne lève pas si l'utilisateur n'a aucun jeton", async () => {
      await expect(depot.revoquerEnAttente(uid())).resolves.toBeUndefined();
    });

    it("refuse un userId qui n'est pas un ObjectId valide, sans rien supprimer", async () => {
      const victime = uid();
      await depot.emettre(victime, "reset", T0);

      const invalides: unknown[] = [{ $ne: null }, "pas-un-objectid", "", null, undefined, 42, [victime]];
      for (const valeur of invalides) {
        await expect(depot.revoquerEnAttente(valeur as string)).rejects.toThrow("userId invalide");
      }

      // Aucun jeton supprimé, y compris celui de la « victime » qu'un filtre `{ $ne: null }` non
      // gardé aurait effacé avec tous les autres jetons en attente du système.
      expect(await PasswordResetToken.countDocuments({ usedAt: null })).toBe(1);
    });
  });
});
