import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { authOptions } from "@/backend/comptes/infrastructure/next-auth/options";
import { refreshTokenFromDb } from "@/backend/comptes/infrastructure/next-auth/rafraichissement";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";

async function seed(passwordChangedAt?: Date) {
  return User.create({
    username: "u", nom: "U", email: "u@srh.ci", motDePasseHash: "x", role: "dispatcher",
    ...(passwordChangedAt ? { passwordChangedAt } : {}),
  });
}

const token = (id: string, issuedAt?: number) =>
  ({ id, username: "u", role: "dispatcher", ...(issuedAt !== undefined ? { issuedAt } : {}) } as never);

describe("invalidation des sessions par réinitialisation", () => {
  it("un jeton émis AVANT la réinitialisation devient invalide", async () => {
    const changedAt = new Date(Date.UTC(2026, 8, 20, 12, 0, 0));
    const user = await seed(changedAt);
    const refreshed = await refreshTokenFromDb(token(String(user._id), changedAt.getTime() - 1000));
    expect(refreshed.invalid).toBe(true);
  });

  it("un jeton émis APRÈS la réinitialisation reste valide", async () => {
    const changedAt = new Date(Date.UTC(2026, 8, 20, 12, 0, 0));
    const user = await seed(changedAt);
    const refreshed = await refreshTokenFromDb(token(String(user._id), changedAt.getTime() + 1000));
    expect(refreshed.invalid).toBeFalsy();
  });

  it("sans passwordChangedAt, aucun jeton n'est invalidé (comptes existants)", async () => {
    const user = await seed();
    expect((await refreshTokenFromDb(token(String(user._id)))).invalid).toBeFalsy();
    expect((await refreshTokenFromDb(token(String(user._id), 1))).invalid).toBeFalsy();
  });

  it("un jeton sans issuedAt est considéré comme antérieur à une réinitialisation", async () => {
    const user = await seed(new Date());
    expect((await refreshTokenFromDb(token(String(user._id)))).invalid).toBe(true);
  });
});

describe("issuedAt dans le callback jwt", () => {
  it("est posé à la première connexion puis conservé par les relectures suivantes", async () => {
    const user = await seed();
    const before = Date.now();

    const first = await authOptions.callbacks!.jwt!({
      token: {},
      user: { id: String(user._id), username: "u", role: "dispatcher" },
    } as never);
    const after = Date.now();

    expect(typeof first.issuedAt).toBe("number");
    expect(first.issuedAt!).toBeGreaterThanOrEqual(before);
    expect(first.issuedAt!).toBeLessThanOrEqual(after);

    // Relecture forcée (update) : issuedAt ne doit jamais être réécrit, sinon
    // l'invalidation ne pourrait jamais se déclencher.
    const forced = { ...first, issuedAt: first.issuedAt! - 60_000 };
    const refreshed = await authOptions.callbacks!.jwt!({ token: forced, trigger: "update" } as never);
    expect(refreshed.issuedAt).toBe(forced.issuedAt);
    expect(typeof refreshed.refreshedAt).toBe("number");
  });

  it("une relecture après réinitialisation invalide le jeton émis avant elle", async () => {
    const user = await seed();
    const first = await authOptions.callbacks!.jwt!({
      token: {},
      user: { id: String(user._id), username: "u", role: "dispatcher" },
    } as never);

    await User.updateOne(
      { _id: user._id },
      { $set: { motDePasseHash: await bcrypt.hash("Autre1234", 4), passwordChangedAt: new Date(first.issuedAt! + 1000) } }
    );

    const refreshed = await authOptions.callbacks!.jwt!({ token: first, trigger: "update" } as never);
    expect(refreshed.invalid).toBe(true);
    expect(refreshed.issuedAt).toBe(first.issuedAt);
  });
});
