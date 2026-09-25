import { describe, it, expect } from "vitest";
import { authOptions } from "@/lib/auth";
import { needsRefresh, refreshTokenFromDb, REFRESH_INTERVAL_MS } from "@/lib/auth-refresh";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";

const baseToken = (id: string) =>
  ({ id, username: "u", role: "dispatcher", mustChangePassword: true } as never);

describe("refreshTokenFromDb", () => {
  it("reflète un changement de rôle, de rattachement et la fin du changement forcé", async () => {
    const client = await Client.create({ nom: "C" });
    const user = await User.create({
      username: "u", nom: "U", email: "u@srh.ci", motDePasseHash: "x",
      role: "client", clientId: client._id, mustChangePassword: false,
    });

    const token = await refreshTokenFromDb(baseToken(String(user._id)));

    expect(token.role).toBe("client");
    expect(token.clientId).toBe(String(client._id));
    expect(token.mustChangePassword).toBe(false);
    expect(token.invalid).toBeFalsy();
    expect(typeof token.refreshedAt).toBe("number");
  });

  it("marque le jeton invalide si le compte a été supprimé", async () => {
    const token = await refreshTokenFromDb(baseToken("507f1f77bcf86cd799439099"));
    expect(token.invalid).toBe(true);
  });
});

describe("needsRefresh", () => {
  const now = 1_000_000_000_000;
  const tok = (refreshedAt?: number) => ({ refreshedAt } as never);

  it("exige une relecture sans horodatage", () => {
    expect(needsRefresh(tok(), now)).toBe(true);
  });

  it("n'en exige pas juste après un rafraîchissement", () => {
    expect(needsRefresh(tok(now), now)).toBe(false);
  });

  it("l'exige au-delà de l'intervalle, mais pas exactement à la limite", () => {
    expect(needsRefresh(tok(now - REFRESH_INTERVAL_MS - 1), now)).toBe(true);
    expect(needsRefresh(tok(now - REFRESH_INTERVAL_MS), now)).toBe(false);
  });
});

describe("callback jwt", () => {
  it("ignore la charge utile client d'un update()", async () => {
    const user = await User.create({ username: "l", nom: "L", email: "l@srh.ci", motDePasseHash: "x", role: "lecture" });
    const token = await authOptions.callbacks!.jwt!({
      token: { id: String(user._id), username: "l", role: "lecture" },
      trigger: "update",
      session: { user: { role: "admin", clientId: "507f1f77bcf86cd799439099" } },
    } as never);
    expect(token.role).toBe("lecture");
    expect(token.clientId).toBeUndefined();
  });

  it("relit la base tant que le jeton porte le drapeau, même fraîchement rafraîchi", async () => {
    const user = await User.create({
      username: "f", nom: "F", email: "f@srh.ci", motDePasseHash: "x",
      role: "dispatcher", mustChangePassword: false,
    });
    const token = await authOptions.callbacks!.jwt!({
      token: {
        id: String(user._id), username: "f", role: "dispatcher",
        mustChangePassword: true, refreshedAt: Date.now(),
      },
    } as never);
    expect(token.mustChangePassword).toBe(false);
  });

  it("ne relit pas la base pour un jeton sans drapeau fraîchement rafraîchi", async () => {
    const token = await authOptions.callbacks!.jwt!({
      token: {
        id: "507f1f77bcf86cd799439099", username: "x", role: "dispatcher",
        mustChangePassword: false, refreshedAt: Date.now(),
      },
    } as never);
    expect(token.invalid).toBeUndefined();
  });
});
