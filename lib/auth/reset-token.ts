import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { PasswordResetToken } from "@/models/PasswordResetToken";

export type TokenPurpose = "reset" | "invitation";

const TTL_MS: Record<TokenPurpose, number> = {
  reset: 30 * 60 * 1000,
  invitation: 72 * 60 * 60 * 1000,
};

// 32 octets encodés en base64url = 43 caractères.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Émet un jeton à usage unique ; seule son empreinte est conservée. */
export async function issueResetToken(
  userId: string,
  purpose: TokenPurpose,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  // Garde de type : un objet (ex. { $ne: null }) ne doit jamais atteindre le filtre deleteMany.
  if (typeof userId !== "string" || !mongoose.isValidObjectId(userId)) {
    throw new Error("userId invalide");
  }

  await connectDB();
  // Garantit que l'index unique sur `tokenHash` existe avant toute écriture (mémoïsé par Mongoose).
  await PasswordResetToken.init();

  // Un seul jeton actif par utilisateur ET par finalité : une demande publique de réinitialisation
  // ne doit pas détruire une invitation (72 h) encore en attente, et inversement.
  await PasswordResetToken.deleteMany({ userId, purpose, usedAt: null });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + TTL_MS[purpose]);
  await PasswordResetToken.create({ userId, tokenHash: hashToken(token), purpose, expiresAt });

  return { token, expiresAt };
}

/** Consomme le jeton (atomique) ; null s'il est inconnu, mal formé, expiré ou déjà utilisé. */
export async function consumeResetToken(
  token: string,
  now: Date = new Date()
): Promise<{ userId: string; purpose: TokenPurpose } | null> {
  if (typeof token !== "string" || !TOKEN_FORMAT.test(token)) return null;

  await connectDB();
  await PasswordResetToken.init();
  const doc = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true }
  );

  return doc ? { userId: String(doc.userId), purpose: doc.purpose as TokenPurpose } : null;
}
