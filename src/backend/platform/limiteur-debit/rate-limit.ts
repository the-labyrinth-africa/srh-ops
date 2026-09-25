import { createHash } from "node:crypto";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { RateLimit } from "./rate-limit.model";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function hashId(id: string): string {
  return createHash("sha256").update(id.trim().toLowerCase()).digest("hex").slice(0, 32);
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * `scope` est stocké en clair dans la clé : il ne doit JAMAIS contenir de donnée personnelle
 * (les identifiants passent par `hashId`).
 *
 * Fenêtre fixe : au plus `limit` appels par `windowMs` et par (portée, identifiant).
 * Un salve à cheval sur deux fenêtres peut atteindre 2 × limit : acceptable ici.
 */
export async function consumeRateLimit(
  scope: string,
  id: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now()
): Promise<RateLimitResult> {
  await connectDB();
  // Garantit que l'index unique sur `key` existe avant tout upsert (mémoïsé par Mongoose ;
  // échoue fermé si la construction de l'index échoue). Sans lui, des upserts concurrents
  // sur une nouvelle clé créeraient chacun un document et contourneraient la limite.
  await RateLimit.init();

  const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs;
  const windowEnd = windowStart + opts.windowMs;
  const key = `${scope}:${hashId(id)}:${windowStart}`;

  let count = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await RateLimit.findOneAndUpdate(
        { key },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd) } },
        { upsert: true, new: true }
      );
      count = doc.count;
      break;
    } catch (error) {
      // Deux premières insertions concurrentes : la seconde échoue sur l'index unique, on réessaie.
      if (!isDuplicateKey(error) || attempt === 1) throw error;
    }
  }

  return {
    allowed: count <= opts.limit,
    remaining: Math.max(0, opts.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}
