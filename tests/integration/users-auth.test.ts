import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";
import bcrypt from "bcryptjs";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { connectDB } from "@/lib/db";
import { getMemoryTransport } from "@/lib/mail";
import mongoose from "mongoose";
import { User } from "@/models/User";
import { Equipe } from "@/models/Equipe";
import { GET as getUsers, POST as createUser } from "@/app/api/users/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as createClient } from "@/app/api/clients/route";
import { POST as createSite } from "@/app/api/sites/route";
import { POST as createOperation } from "@/app/api/operations/route";
import { PATCH as updateStatus } from "@/app/api/operations/[id]/statut/route";

describe("Users, Authentication Roles & Operations Quantities Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMemoryTransport().reset();
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: {
        id: "507f1f77bcf86cd799439011",
        name: "Admin System",
        email: "admin@srh.ci",
        username: "admin_sys",
        role: "admin",
      },
    } as any);
  });

  describe("User Management API", () => {
    it("should allow admin to create user with auto generated password", async () => {
      // Le transport de test est en mémoire : sans échec simulé, l'invitation réussit et aucun
      // mot de passe n'est renvoyé. On force l'échec pour tester le repli (mot de passe temporaire).
      getMemoryTransport().failNext();
      vi.spyOn(console, "error").mockImplementation(() => {});
      // Un chauffeur doit désormais être rattaché à une équipe existante.
      const equipe = await Equipe.create({ nom: "Équipe test création" });
      const req = new NextRequest("http://localhost:3000/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: "chauffeur_jean",
          nom: "Jean Marc",
          email: "jean.marc@srh.ci",
          role: "chauffeur",
          telephone: "+22501020304",
          equipeId: String(equipe._id),
        }),
      });

      const res = await createUser(req);
      expect(res.status).toBe(201);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const data = await res.json();
      expect(data.user._id).toBeDefined();
      expect(data.user.username).toBe("chauffeur_jean");
      expect(data.user.role).toBe("chauffeur");
      expect(data.invitation).toBe("not_sent");
      expect(data.generatedPassword).toBeDefined();
      expect(data.generatedPassword.length).toBeGreaterThanOrEqual(8);

      // Verify listing users as Admin
      const reqList = new NextRequest("http://localhost:3000/api/users");
      const resList = await getUsers(reqList);
      expect(resList.status).toBe(200);
      const users = await resList.json();
      expect(users.some((u: any) => u.username === "chauffeur_jean")).toBe(true);
    });

    it("should never log or duplicate the generated password (C5)", async () => {
      // Repli : l'envoi échoue pour que le mot de passe temporaire soit renvoyé (et donc vérifiable).
      getMemoryTransport().failNext();
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {})
      );

      try {
        const res = await createUser(
          new NextRequest("http://localhost:3000/api/users", {
            method: "POST",
            body: JSON.stringify({
              username: "secret_user",
              nom: "Secret User",
              email: "secret@srh.ci",
              role: "lecture",
            }),
          })
        );
        expect(res.status).toBe(201);
        const data = await res.json();

        const password: string = data.generatedPassword;
        expect(password).toBeDefined();

        // Le mot de passe n'apparaît qu'une seule fois, dans son champ dédié
        expect(data.message).not.toContain(password);

        const consoleOutput = spies
          .flatMap((spy) => spy.mock.calls)
          .flat()
          .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
          .join("\n");
        expect(consoleOutput).not.toContain(password);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    });

    it("should prevent non-admin from creating users", async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({
        user: {
          id: "507f1f77bcf86cd799439012",
          name: "Dispatcher User",
          email: "dispatch@srh.ci",
          role: "dispatcher",
        },
      } as any);

      const req = new NextRequest("http://localhost:3000/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: "new_tech",
          nom: "Technicien Test",
          email: "tech@srh.ci",
          role: "chauffeur",
        }),
      });

      const res = await createUser(req);
      expect(res.status).toBe(403);
    });
  });

  describe("Forgot Password Flow (jeton par e-mail)", () => {
    it("should not touch the password hash of a legacy user without a username field (non-régression)", async () => {
      await connectDB();
      // Reproduit le cas des comptes semés avant l'introduction du champ username
      // (insertion directe pour contourner la validation Mongoose du champ required)
      const hash = await bcrypt.hash("legacy123", 10);
      const inserted = await User.collection.insertOne({
        email: "legacy@srh.ci",
        nom: "Legacy User",
        motDePasseHash: hash,
        role: "dispatcher",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await forgotPassword(
        new NextRequest("http://localhost:3000/api/auth/forgot-password", {
          method: "POST",
          headers: { "x-forwarded-for": "198.51.100.200" },
          body: JSON.stringify({ identifier: "legacy@srh.ci" }),
        })
      );
      expect(res.status).toBe(200);

      // La demande n'écrit jamais le mot de passe : seul un jeton à usage unique est émis.
      const after = (await User.collection.findOne({ _id: inserted.insertedId }))!;
      expect(after.motDePasseHash).toBe(hash);

      await User.collection.deleteOne({ _id: inserted.insertedId });
    });
  });

  describe("Change Password Flow", () => {
    it("should allow changing password when the account has no username (non-régression)", async () => {
      await connectDB();
      const adminId = "507f1f77bcf86cd799439011";
      const inserted = await User.collection.insertOne({
        _id: new mongoose.Types.ObjectId(adminId),
        email: "admin@srh.ci",
        nom: "Admin Legacy",
        motDePasseHash: await bcrypt.hash("oldPass123", 10),
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "oldPass123", newPassword: "newPass123" }),
      });
      const res = await changePassword(req);
      expect(res.status).toBe(200);

      const updated = (await User.collection.findOne({ _id: inserted.insertedId }))!;
      expect(updated.mustChangePassword).toBe(false);
      const valid = await bcrypt.compare("newPass123", updated.motDePasseHash);
      expect(valid).toBe(true);

      await User.collection.deleteOne({ _id: inserted.insertedId });
    });

    it("should reject a wrong current password", async () => {
      await connectDB();
      const adminId = "507f1f77bcf86cd799439011";
      const inserted = await User.collection.insertOne({
        _id: new mongoose.Types.ObjectId(adminId),
        email: "admin2@srh.ci",
        nom: "Admin Deux",
        motDePasseHash: await bcrypt.hash("correctPass", 10),
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "wrongPass", newPassword: "newPass123" }),
      });
      const res = await changePassword(req);
      expect(res.status).toBe(400);

      await User.collection.deleteOne({ _id: inserted.insertedId });
    });
  });

  describe("Operation Status & Collected Quantities", () => {
    it("should record collected waste quantity and measurement unit during status update", async () => {
      // 1. Create Client & Site
      const client = await (
        await createClient(
          new NextRequest("http://localhost:3000/api/clients", {
            method: "POST",
            body: JSON.stringify({
              nom: "Sotra Dépôt Abidjan",
              contact: { telephone: "+22501000000", email: "sotra@transport.ci" },
            }),
          })
        )
      ).json();

      const site = await (
        await createSite(
          new NextRequest("http://localhost:3000/api/sites", {
            method: "POST",
            body: JSON.stringify({
              clientId: client._id,
              nom: "Atelier Vridi",
              adresse: "Zone Portuaire Vridi",
              typeDechets: ["Huiles moteur usagées"],
            }),
          })
        )
      ).json();

      // 2. Create Operation
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const op = await (
        await createOperation(
          new NextRequest("http://localhost:3000/api/operations", {
            method: "POST",
            body: JSON.stringify({
              clientId: client._id,
              siteId: site._id,
              natureIntervention: "Vidange bacs à huile",
              dateHeurePrevue: tomorrow.toISOString(),
            }),
          })
        )
      ).json();

      // 3. Progress status step-by-step: Planifiée → Affectée → En route → En cours
      await updateStatus(
        new NextRequest(`http://localhost:3000/api/operations/${op._id}/statut`, {
          method: "PATCH",
          body: JSON.stringify({ statut: "Affectée" }),
        }),
        { params: Promise.resolve({ id: op._id }) }
      );

      await updateStatus(
        new NextRequest(`http://localhost:3000/api/operations/${op._id}/statut`, {
          method: "PATCH",
          body: JSON.stringify({ statut: "En route" }),
        }),
        { params: Promise.resolve({ id: op._id }) }
      );

      await updateStatus(
        new NextRequest(`http://localhost:3000/api/operations/${op._id}/statut`, {
          method: "PATCH",
          body: JSON.stringify({ statut: "En cours" }),
        }),
        { params: Promise.resolve({ id: op._id }) }
      );

      // 4. Complete operation with collected quantity (e.g. 4500 Litres)
      const resComplete = await updateStatus(
        new NextRequest(`http://localhost:3000/api/operations/${op._id}/statut`, {
          method: "PATCH",
          body: JSON.stringify({
            statut: "Terminée",
            quantiteCollectee: 4500,
            uniteQuantite: "Litres",
            remarquesTerrain: "Aspiration complète cuve 1",
          }),
        }),
        { params: Promise.resolve({ id: op._id }) }
      );

      expect(resComplete.status).toBe(200);
      const updatedOp = await resComplete.json();
      expect(updatedOp.statut).toBe("Terminée");
      expect(updatedOp.quantiteCollectee).toBe(4500);
      expect(updatedOp.uniteQuantite).toBe("Litres");
      expect(updatedOp.remarquesTerrain).toBe("Aspiration complète cuve 1");
    });
  });
});
