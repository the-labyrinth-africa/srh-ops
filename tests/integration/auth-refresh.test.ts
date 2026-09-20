import { describe, it, expect } from "vitest";
import { refreshTokenFromDb } from "@/lib/auth-refresh";
import { User } from "@/models/User";
import { Client } from "@/models/Client";

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
