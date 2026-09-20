import { describe, it, expect, vi, beforeEach } from "vitest";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as sendTest } from "@/app/api/mail/test/route";
import { getMemoryTransport } from "@/lib/mail";
import { User } from "@/models/User";

function session(role: string, id: string) {
  vi.mocked(nextAuth.getServerSession).mockResolvedValue({
    user: { id, name: "T", email: "session@srh.ci", username: "t", role },
  } as never);
}

const call = () => sendTest();

async function seedAdmin() {
  return User.create({
    username: "admin1", nom: "Admin", email: "admin1@srh.ci", motDePasseHash: "x", role: "admin",
  });
}

describe("POST /api/mail/test", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
  });

  it("un administrateur reçoit l'e-mail de test à SON adresse en base", async () => {
    const admin = await seedAdmin();
    session("admin", String(admin._id));

    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const sent = getMemoryTransport().sent;
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("admin1@srh.ci");
    expect(sent[0].subject).toContain("SRH Ops");
  });

  it.each(["dispatcher", "lecture", "chauffeur", "client"])("%s est refusé (403) et rien n'est envoyé", async (role) => {
    const user = await User.create({
      username: `u_${role}`, nom: "U", email: `${role}@srh.ci`, motDePasseHash: "x", role,
      ...(role === "client" ? { clientId: "507f1f77bcf86cd799439011" } : {}),
    });
    session(role, String(user._id));
    const res = await call();
    expect(res.status).toBe(403);
    expect(getMemoryTransport().sent).toHaveLength(0);
  });

  it("renvoie 502 avec la raison quand l'envoi échoue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = await seedAdmin();
    session("admin", String(admin._id));
    getMemoryTransport().failNext();

    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, reason: "send_failed" });
  });

  it("limite à 5 envois par heure (429 au sixième)", async () => {
    const admin = await seedAdmin();
    session("admin", String(admin._id));
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call()).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(getMemoryTransport().sent).toHaveLength(5);
  });
});
