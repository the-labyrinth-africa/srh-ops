import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as genererRapport } from "@/app/api/operations/[id]/rapport/route";
import { Operation } from "@/backend/operations/infrastructure/mongoose/operation.model";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { User } from "@/backend/comptes/infrastructure/mongoose/utilisateur.model";

// Image PNG 1×1 valide (signature et photo de test).
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const nouvelId = () => String(new mongoose.Types.ObjectId());

describe("Caractérisation — rapport PDF d'intervention", () => {
  let userId: string;
  let clientId: string;
  let siteId: string;
  let equipeId: string;
  let vehiculeId: string;

  const connecter = (role: string, rattachements: Record<string, string> = {}) =>
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: { id: userId, nom: "Admin Ops", email: "admin@srh.ci", role, ...rattachements },
    } as never);

  const creer = async (surcharge: Record<string, unknown> = {}) => {
    const operation = await Operation.create({
      clientId,
      siteId,
      natureIntervention: "Collecte Rapport",
      dateHeurePrevue: new Date("2030-11-01T10:00:00Z"),
      statut: "Planifiée",
      ...surcharge,
    });
    return String(operation._id);
  };

  const rapport = (id: string) =>
    genererRapport(new NextRequest(`http://localhost:3000/api/operations/${id}/rapport`), {
      params: Promise.resolve({ id }),
    });

  /** Contenu brut du PDF : les textes y figurent en clair (police standard, sans compression). */
  const contenu = async (res: Response) => Buffer.from(await res.arrayBuffer()).toString("latin1");
  const pages = (pdf: string) => (pdf.match(/\/Type \/Page\b/g) ?? []).length;

  beforeEach(async () => {
    vi.resetAllMocks();
    const user = await User.create({
      username: "admin",
      nom: "Admin Ops",
      email: "admin@srh.ci",
      motDePasseHash: "x",
      role: "admin",
    });
    userId = String(user._id);
    connecter("admin");

    const client = await Client.create({ nom: "Client A" });
    const site = await Site.create({ clientId: client._id, nom: "Site A", adresse: "Rue 1" });
    const equipe = await Equipe.create({ nom: "Equipe A" });
    const vehicule = await Vehicule.create({ identification: "V-001" });
    clientId = String(client._id);
    siteId = String(site._id);
    equipeId = String(equipe._id);
    vehiculeId = String(vehicule._id);
  });

  it("opération minimale : 200, en-têtes exacts, une page, sections facultatives absentes", async () => {
    const id = await creer();

    const res = await rapport(id);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="rapport-${id.slice(-8).toUpperCase()}.pdf"`
    );
    const pdf = await contenu(res);
    expect(pdf.startsWith("%PDF")).toBe(true);
    expect(pages(pdf)).toBe(1);
    for (const texte of [
      "SRH Recyclage",
      "Rapport d'Intervention",
      `Ref: #${id.slice(-8).toUpperCase()}`,
      "Collecte Rapport",
      "Planifi",
      "120 min",
      "Client A",
      "Site A",
      "Rue 1",
      "Non affect",
      "Page 1/1",
    ]) {
      expect(pdf, texte).toContain(texte);
    }
    for (const absent of ["Relev", "Historique des Statuts", "Signature du Client", "Photos de l'intervention"]) {
      expect(pdf, absent).not.toContain(absent);
    }
  });

  it("opération complète : quantités, historique avec auteur, signature et photos chacune sur une nouvelle page", async () => {
    const id = await creer({
      equipeId,
      vehiculeId,
      statut: "Rapportée",
      dureeEstimeeMinutes: 90,
      quantiteCollectee: 800,
      uniteQuantite: "Kg",
      remarquesTerrain: "Cuve pleine",
      nomSignataireClient: "M. Konan",
      signatureClient: PIXEL,
      photos: [
        { url: PIXEL, nom: "cuve.png" },
        { url: PIXEL, nom: "" },
      ],
      historiqueStatuts: [
        { statut: "Planifiée", date: new Date("2030-11-01T08:00:00Z") },
        { statut: "Rapportée", date: new Date("2030-11-01T12:00:00Z"), parUtilisateur: userId, ancienStatut: "Terminée" },
      ],
    });

    const pdf = await contenu(await rapport(id));

    expect(pages(pdf)).toBe(3);
    for (const texte of [
      "90 min",
      "Equipe A",
      "V-001",
      "Quantit",
      "800 Kg",
      "Cuve pleine",
      "Historique des Statuts",
      "Admin Ops",
      "Signature du Client",
      "Signataire: M. Konan",
      "Photos de l'intervention \\(2\\)",
      "cuve.png",
      "Photo 2",
      "Page 3/3",
    ]) {
      expect(pdf, texte).toContain(texte);
    }
    expect(pdf).not.toContain("Non affect");
  });

  it("quantité absente ou nulle : pas de relevé ; remarques vides : « Aucune »", async () => {
    const sansQuantite = await creer({ remarquesTerrain: "ignorée" });
    expect(await contenu(await rapport(sansQuantite))).not.toContain("Relev");

    const avecQuantite = await creer({ quantiteCollectee: 5, dateHeurePrevue: new Date("2030-11-02T10:00:00Z") });
    const pdf = await contenu(await rapport(avecQuantite));
    expect(pdf).toContain("Relev");
    expect(pdf).toContain("Aucune");
    expect(pdf).toContain("Litres");
  });

  it("client et équipe supprimés : le rapport est produit quand même", async () => {
    const id = await creer({ equipeId });
    await Client.deleteOne({ _id: clientId });
    await Equipe.deleteOne({ _id: equipeId });

    const res = await rapport(id);

    expect(res.status).toBe(200);
    const pdf = await contenu(res);
    expect(pdf).not.toContain("Client A");
    expect(pdf).toContain("Non affect");
  });

  it("le rapport n'est jamais réécrit dans l'opération", async () => {
    const id = await creer();
    await rapport(id);
    const enBase = (await Operation.findById(id).lean()) as unknown as { rapportPdf?: string; __v: number };
    expect(enBase.rapportPdf ?? "").toBe("");
    expect(enBase.__v).toBe(0);
  });

  it("ordre des refus : chauffeur sans équipe (403), identifiant (400), introuvable (404)", async () => {
    connecter("chauffeur");
    const sansEquipe = await rapport("abc");
    expect(sansEquipe.status).toBe(403);
    expect(await sansEquipe.json()).toEqual({ error: "Compte chauffeur sans équipe attribuée" });

    connecter("admin");
    const invalide = await rapport("abc");
    expect(invalide.status).toBe(400);
    expect(await invalide.json()).toEqual({ error: "Identifiant invalide" });

    const absent = await rapport(nouvelId());
    expect(absent.status).toBe(404);
    expect(await absent.json()).toEqual({ error: "Non trouvé" });
  });

  it("périmètre : autre client, autre équipe, opération sans équipe pour un chauffeur → 404 ; lecture seule → 200", async () => {
    const affectee = await creer({ equipeId });
    const sansEquipe = await creer({ dateHeurePrevue: new Date("2030-11-03T10:00:00Z") });

    connecter("client", { clientId: nouvelId() });
    const autreClient = await rapport(affectee);
    expect(autreClient.status).toBe(404);
    expect(await autreClient.json()).toEqual({ error: "Non trouvé" });

    connecter("client", { clientId });
    expect((await rapport(affectee)).status).toBe(200);

    connecter("chauffeur", { equipeId: nouvelId() });
    expect((await rapport(affectee)).status).toBe(404);

    connecter("chauffeur", { equipeId });
    expect((await rapport(affectee)).status).toBe(200);
    expect((await rapport(sansEquipe)).status).toBe(404);

    connecter("lecture");
    expect((await rapport(affectee)).status).toBe(200);
  });
});
