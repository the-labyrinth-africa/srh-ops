import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { requireAuth, isWithinClientScope, isWithinTeamScope, chauffeurWithoutTeamError } from "@/backend/comptes";
import { Operation } from "@/models/Operation";
import { Client } from "@/backend/clients-sites/infrastructure/mongoose/client.model";
import { Site } from "@/backend/clients-sites/infrastructure/mongoose/site.model";
import { Equipe } from "@/backend/equipes/infrastructure/mongoose/equipe.model";
import { Vehicule } from "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import { Equipement } from "@/backend/equipements/infrastructure/mongoose/equipement.model";
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";
import { guardObjectId } from "@/backend/platform/http/identifiants";

type Params = { params: Promise<{ id: string }> };

interface PopulatedOperation {
  _id: unknown;
  natureIntervention: string;
  dateHeurePrevue: Date;
  dureeEstimeeMinutes: number;
  statut: OperationStatus;
  clientId?: { _id?: unknown; nom?: string } | null;
  siteId?: { nom?: string; adresse?: string } | null;
  equipeId?: { nom?: string } | null;
  vehiculeId?: { identification?: string } | null;
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
  photos: { url: string; nom: string }[];
  historiqueStatuts?: {
    statut: OperationStatus;
    date: Date;
    parUtilisateur?: { nom?: string } | null;
    ancienStatut?: OperationStatus;
  }[];
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const noTeam = chauffeurWithoutTeamError(auth);
  if (noTeam) return noTeam;

  const { id } = await params;
  const guard = guardObjectId(id);
  if (!guard.valid) return guard.error;
  await connectDB();
  void Client; void Site; void Equipe; void Vehicule; void Equipement;

  const operation = (await Operation.findById(id)
    .populate("clientId", "nom contact")
    .populate("siteId", "nom adresse typeDechets")
    .populate("equipeId", "nom membres")
    .populate("vehiculeId", "identification type")
    .populate("equipementIds", "nom type")
    .populate("historiqueStatuts.parUtilisateur", "nom")
    .lean()) as unknown as PopulatedOperation | null;

  if (!operation) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }

  if (!isWithinClientScope(auth, operation.clientId)) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
  if (!isWithinTeamScope(auth, operation.equipeId)) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFillColor(13, 99, 27);
  doc.rect(0, 0, pageWidth, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("SRH Recyclage", 20, 18);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Rapport d'Intervention", 20, 28);
  doc.setFontSize(9);
  doc.text(
    `Ref: #${String(operation._id).slice(-8).toUpperCase()} | Généré le ${new Date().toLocaleDateString("fr-FR")}`,
    20,
    35
  );

  y = 50;

  // Operation info
  doc.setTextColor(7, 30, 39);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(operation.natureIntervention, 20, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const infoData: [string, string][] = [
    ["Statut", operation.statut],
    ["Date prévue", new Date(operation.dateHeurePrevue).toLocaleDateString("fr-FR")],
    ["Durée estimée", `${operation.dureeEstimeeMinutes} min`],
    ["Client", operation.clientId?.nom ?? "—"],
    [
      "Site",
      `${operation.siteId?.nom ?? "—"} — ${operation.siteId?.adresse ?? ""}`,
    ],
    ["Équipe", operation.equipeId?.nom ?? "Non affectée"],
    ["Véhicule", operation.vehiculeId?.identification ?? "Non affecté"],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Champ", "Valeur"]],
    body: infoData,
    theme: "grid",
    headStyles: { fillColor: [13, 99, 27], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
    margin: { left: 20, right: 20 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // Quantities section
  if (operation.quantiteCollectee !== undefined && operation.quantiteCollectee > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Relevé des Quantités", 20, y);
    y += 7;

    autoTable(doc, {
      startY: y,
      head: [["Paramètre", "Valeur"]],
      body: [
        ["Quantité collectée", `${operation.quantiteCollectee.toLocaleString("fr-FR")} ${operation.uniteQuantite || "L"}`],
        ["Remarques terrain", operation.remarquesTerrain || "Aucune"],
      ],
      theme: "grid",
      headStyles: { fillColor: [13, 99, 27], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
      margin: { left: 20, right: 20 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Status history
  if (operation.historiqueStatuts && operation.historiqueStatuts.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Historique des Statuts", 20, y);
    y += 7;

    const historyData = operation.historiqueStatuts.map((h) => [
      h.statut,
      new Date(h.date).toLocaleString("fr-FR"),
      h.parUtilisateur?.nom ?? "—",
      h.ancienStatut || "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Statut", "Date", "Par", "Ancien statut"]],
      body: historyData,
      theme: "grid",
      headStyles: { fillColor: [13, 99, 27], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 20, right: 20 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Signature section
  if (operation.signatureClient) {
    if (y > 180) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Signature du Client", 20, y);
    y += 3;

    if (operation.nomSignataireClient) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Signataire: ${operation.nomSignataireClient}`, 20, y + 8);
      y += 5;
    }

    try {
      doc.addImage(operation.signatureClient, "PNG", 20, y + 5, 60, 30);
      y += 40;
    } catch {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("(Signature enregistrée)", 20, y + 10);
      y += 15;
    }
  }

  // Photos section
  if (operation.photos && operation.photos.length > 0) {
    doc.addPage();
    y = 20;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(7, 30, 39);
    doc.text(`Photos de l'intervention (${operation.photos.length})`, 20, y);
    y += 10;

    let x = 20;
    for (let i = 0; i < operation.photos.length; i++) {
      if (x > pageWidth - 60) {
        x = 20;
        y += 55;
      }
      if (y > 230) {
        doc.addPage();
        y = 20;
      }
      try {
        doc.addImage(operation.photos[i].url, "JPEG", x, y, 50, 50);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(operation.photos[i].nom || `Photo ${i + 1}`, x, y + 53);
      } catch {
        doc.setFontSize(7);
        doc.text(`[Photo ${i + 1} non affichable]`, x, y + 10);
      }
      x += 55;
    }
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `SRH Recyclage — Rapport d'intervention — Page ${i}/${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  const pdfBase64 = doc.output("datauristring");

  // C6 : le PDF n'est PAS réécrit dans le document Operation. Un rapport de
  // plusieurs Mo en base64 poussait le document vers la limite BSON de 16 Mo,
  // sur une simple requête GET. Le rapport est regénéré à la demande.

  return new NextResponse(
    Buffer.from(pdfBase64.split(",")[1], "base64"),
    {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rapport-${String(operation._id).slice(-8).toUpperCase()}.pdf"`,
      },
    }
  );
}
