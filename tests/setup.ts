import { beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import "fake-indexeddb/auto";

// Réinitialise la base hors-ligne entre chaque test d'outbox.
beforeEach(async () => {
  const { clearOutbox } = await import("@/lib/offline/outbox");
  await clearOutbox().catch(() => {});
});
let mongoServer: MongoMemoryServer;

/**
 * Les workers Vitest démarrent en parallèle et se disputent parfois le même port (« Port already
 * in use ») ou démarrent trop lentement : on réessaie avec un court délai aléatoire.
 */
async function createMongoServer(maxAttempts = 5): Promise<MongoMemoryServer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Équivalent de MongoMemoryServer.create(), mais l'instance reste accessible si start() échoue.
    const candidate = new MongoMemoryServer();
    try {
      await candidate.start();
      return candidate;
    } catch (error) {
      lastError = error;
      // Une instance à moitié démarrée ne doit pas rester en vie.
      await candidate.stop().catch(() => {});
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));
      }
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`MongoMemoryServer : démarrage impossible après ${maxAttempts} tentatives (${reason})`);
}

beforeAll(async () => {
  mongoServer = await createMongoServer();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  process.env.NEXTAUTH_SECRET = "test-secret-key-1234567890-super-secret";
  process.env.NEXTAUTH_URL = "http://localhost:3000";

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri);
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
