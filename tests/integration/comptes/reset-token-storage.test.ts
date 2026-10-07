import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { JetonRepositoryMongoose } from "@/backend/comptes/infrastructure/mongoose/jeton.repository.mongoose";
import { PasswordResetToken } from "@/backend/comptes/infrastructure/mongoose/jeton.model";

const depot = new JetonRepositoryMongoose();
const uid = () => String(new mongoose.Types.ObjectId());
const T0 = new Date(Date.UTC(2026, 8, 20, 10, 0, 0));

function sha256Hex(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex");
}

describe("stockage des jetons", () => {
  it("l'index unique sur tokenHash et l'index TTL sur expiresAt existent", async () => {
    await PasswordResetToken.init();
    const indexes = await PasswordResetToken.collection.indexes();
    const byHash = indexes.find((index) => index.key.tokenHash === 1);
    const byExpiry = indexes.find((index) => index.key.expiresAt === 1);
    expect(byHash?.unique).toBe(true);
    expect(byExpiry?.expireAfterSeconds).toBe(86_400);
  });

  it("stocke exactement l'empreinte SHA-256 du jeton émis", async () => {
    const { token } = await depot.emettre(uid(), "reset", T0);
    const documents = await PasswordResetToken.find().lean();
    expect(documents[0]?.tokenHash).toBe(sha256Hex(token));
  });
});