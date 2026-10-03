import { describe, it, expect } from "vitest";
import type { Operation } from "../../domain/operation";
import { GenerateurRapportJsPdf } from "./generateur-rapport.jspdf";

// Image PNG 1×1 valide.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const GENERE_LE = new Date("2030-11-05T09:00:00.000Z");

const operation = (surcharge: Partial<Operation> = {}): Operation => ({
  id: "6ac0f07a0086aca5b0ced976",
  clientId: { id: "c1", nom: "Client A" },
  siteId: { id: "s1", nom: "Site A", adresse: "Rue 1" },
  natureIntervention: "Collecte Rapport",
  dateHeurePrevue: new Date("2030-11-01T10:00:00.000Z"),
  dureeEstimeeMinutes: 120,
  equipementIds: [],
  informationsParticulieres: "",
  statut: "Planifiée",
  historiqueStatuts: [],
  uniteQuantite: "Litres",
  remarquesTerrain: "",
  nomSignataireClient: "",
  signatureClient: "",
  photos: [],
  rapportPdf: "",
  ...surcharge,
});

const generer = async (op: Operation) =>
  Buffer.from(await new GenerateurRapportJsPdf().generer(op, GENERE_LE)).toString("latin1");
const pages = (pdf: string) => (pdf.match(/\/Type \/Page\b/g) ?? []).length;

describe("GenerateurRapportJsPdf", () => {
  it("opération minimale : un PDF d'une page, référence, date de génération fournie, sections facultatives absentes", async () => {
    const pdf = await generer(operation());

    expect(pdf.startsWith("%PDF")).toBe(true);
    expect(pages(pdf)).toBe(1);
    for (const texte of [
      "SRH Recyclage",
      "Rapport d'Intervention",
      "Ref: #B0CED976",
      "le 05/11/2030",
      "Collecte Rapport",
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

  it("opération complète : quantités, historique, signature et photos (trois pages)", async () => {
    const pdf = await generer(
      operation({
        equipeId: { id: "e1", nom: "Equipe A" },
        vehiculeId: { id: "v1", identification: "V-001" },
        statut: "Rapportée",
        quantiteCollectee: 800,
        uniteQuantite: "Kg",
        remarquesTerrain: "Cuve pleine",
        nomSignataireClient: "M. Konan",
        signatureClient: PIXEL,
        photos: [
          { url: PIXEL, nom: "cuve.png", uploadedAt: GENERE_LE },
          { url: PIXEL, nom: "", uploadedAt: GENERE_LE },
        ],
        historiqueStatuts: [
          { statut: "Planifiée", date: new Date("2030-11-01T08:00:00.000Z") },
          {
            statut: "Rapportée",
            date: new Date("2030-11-01T12:00:00.000Z"),
            parUtilisateur: { id: "u1", nom: "Admin Ops" },
            ancienStatut: "Terminée",
          },
        ],
      })
    );

    expect(pages(pdf)).toBe(3);
    for (const texte of [
      "Equipe A",
      "V-001",
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
  });

  it.each([
    ["supprimées (null)", null],
    ["non peuplées (identifiant brut)", "abc"],
  ] as const)("relations %s : replis, sans exception", async (_cas, relation) => {
    const pdf = await generer(
      operation({
        clientId: relation,
        siteId: relation,
        equipeId: relation,
        vehiculeId: relation,
        historiqueStatuts: [{ statut: "Planifiée", date: GENERE_LE, parUtilisateur: relation }],
      })
    );
    expect(pdf).not.toContain("Client A");
    expect(pdf).toContain("Non affect");
    expect(pdf).toContain("Historique des Statuts");
  });

  it("quantité nulle : pas de relevé ; quantité positive sans remarques : « Aucune »", async () => {
    expect(await generer(operation({ quantiteCollectee: 0 }))).not.toContain("Relev");
    const pdf = await generer(operation({ quantiteCollectee: 5 }));
    expect(pdf).toContain("5 Litres");
    expect(pdf).toContain("Aucune");
  });

  it("signature ou photo illisible : repli textuel, pas d'exception", async () => {
    const pdf = await generer(
      operation({
        signatureClient: "pas-une-image",
        photos: [{ url: "pas-une-image", nom: "x.jpg", uploadedAt: GENERE_LE }],
      })
    );
    expect(pdf).toContain("Signature enregistr");
    expect(pdf).toContain("[Photo 1 non affichable]");
  });
});
