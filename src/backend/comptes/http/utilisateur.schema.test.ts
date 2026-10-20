import { describe, expect, it } from "vitest";
import { premierAdminCreateSchema, userCreateSchema, userUpdateSchema } from "./utilisateur.schema";

const utilisateurValide = {
  username: "responsable",
  nom: "Responsable entreprise",
  email: "responsable@example.com",
  role: "dispatcher",
};

describe("schémas des utilisateurs d'entreprise", () => {
  it("accepte un rôle d'entreprise", () => {
    expect(userCreateSchema.safeParse(utilisateurValide).success).toBe(true);
  });

  it("refuse le rôle plateforme dans la création et la modification par un administrateur d'entreprise", () => {
    expect(userCreateSchema.safeParse({ ...utilisateurValide, role: "superadmin" }).success).toBe(false);
    expect(userUpdateSchema.safeParse({ ...utilisateurValide, role: "superadmin" }).success).toBe(false);
  });

  it("valide les coordonnées du premier Admin Ops sans accepter un rôle fourni par le client", () => {
    const saisie = {
      username: "admin-ops",
      nom: "Administrateur Ops",
      email: "admin@example.com",
    };
    expect(premierAdminCreateSchema.safeParse(saisie).success).toBe(true);
    const avecRole = premierAdminCreateSchema.safeParse({ ...saisie, role: "superadmin" });
    expect(avecRole.success).toBe(true);
    if (avecRole.success) expect(avecRole.data).not.toHaveProperty("role");
    expect(premierAdminCreateSchema.safeParse({ ...saisie, email: "invalide" }).success).toBe(false);
  });
});
