import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { JetonFinalite, JetonRepository } from "../../domain/ports";
import { PasswordResetToken } from "./jeton.model";

const TTL_MS: Record<JetonFinalite, number> = {
  reset: 30 * 60 * 1000,
  invitation: 72 * 60 * 60 * 1000,
};

// 32 octets encodés en base64url = 43 caractères.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Garde de type : un objet (ex. { $ne: null }) ne doit jamais atteindre un filtre deleteMany. Toute
// méthode qui construit un filtre Mongo à partir d'un `userId` fourni par l'appelant (même interne
// au domaine) doit passer par cette garde avant la première requête.
function garantirUserIdValide(userId: string): void {
  if (typeof userId !== "string" || !mongoose.isValidObjectId(userId)) {
    throw new Error("userId invalide");
  }
}

export class JetonRepositoryMongoose implements JetonRepository {
  /** Émet un jeton à usage unique ; seule son empreinte (SHA-256) est conservée. */
  async emettre(
    userId: string,
    finalite: JetonFinalite,
    maintenant: Date
  ): Promise<{ token: string; expiresAt: Date }> {
    garantirUserIdValide(userId);

    await connectDB();
    // Garantit que l'index unique sur `tokenHash` existe avant toute écriture (mémoïsé par Mongoose).
    await PasswordResetToken.init();

    // Un seul jeton actif par utilisateur ET par finalité : une demande publique de réinitialisation
    // ne doit pas détruire une invitation (72 h) encore en attente, et inversement.
    await PasswordResetToken.deleteMany({ userId, purpose: finalite, usedAt: null });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(maintenant.getTime() + TTL_MS[finalite]);
    await PasswordResetToken.create({ userId, tokenHash: hashToken(token), purpose: finalite, expiresAt });

    return { token, expiresAt };
  }

  /** Consomme le jeton (atomique) ; null s'il est inconnu, mal formé, expiré ou déjà utilisé. */
  async consommer(token: string, maintenant: Date): Promise<{ userId: string; finalite: JetonFinalite } | null> {
    // Rejette le format avant toute requête base (aucune donnée de forme invalide n'atteint Mongo).
    if (typeof token !== "string" || !TOKEN_FORMAT.test(token)) return null;

    await connectDB();
    await PasswordResetToken.init();
    const doc = await PasswordResetToken.findOneAndUpdate(
      { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: maintenant } },
      { $set: { usedAt: maintenant } },
      { new: true }
    );

    return doc ? { userId: String(doc.userId), finalite: doc.purpose as JetonFinalite } : null;
  }

  /** Supprime les jetons non consommés (`usedAt: null`) de l'utilisateur, toutes finalités confondues. */
  async revoquerEnAttente(userId: string): Promise<void> {
    garantirUserIdValide(userId);

    await connectDB();
    await PasswordResetToken.deleteMany({ userId, usedAt: null });
  }
}
