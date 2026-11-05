// src/backend/operations/http/liste.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { casDUsageOperations } from "../composition";
import type { FiltreOperations } from "../domain/operation";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { versReponseOperation } from "./presentation";
import { versReponseOperationClient } from "./presentation";
import { isClientUser } from "@/shared/acces/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const filtre: FiltreOperations = {};

  const clientId = sp.get("clientId");
  const siteId = sp.get("siteId");
  const equipeId = sp.get("equipeId");
  const vehiculeId = sp.get("vehiculeId");
  const statut = sp.get("statut");
  const collectesRealisees = sp.get("collectes");
  if (clientId) filtre.clientId = clientId;
  if (siteId) filtre.siteId = siteId;
  if (equipeId) filtre.equipeId = equipeId;
  if (vehiculeId) filtre.vehiculeId = vehiculeId;
  if (statut) filtre.statut = statut;
  if (collectesRealisees === "1") filtre.collectesRealisees = true;

  const dateDebut = sp.get("dateDebut");
  const dateFin = sp.get("dateFin");
  if (dateDebut) {
    const date = new Date(dateDebut);
    if (!Number.isFinite(date.getTime())) return NextResponse.json({ error: "Date de début invalide." }, { status: 400 });
    filtre.dateDebut = date;
  }
  if (dateFin) {
    const date = new Date(dateFin);
    if (!Number.isFinite(date.getTime())) return NextResponse.json({ error: "Date de fin invalide." }, { status: 400 });
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFin)) date.setUTCHours(23, 59, 59, 999);
    filtre.dateFin = date;
  }

  // Calcul historique, volontairement sans garde-fou (valeurs hors norme renvoyées telles quelles).
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, parseInt(sp.get("limit") || "20", 10));
  const skip = (page - 1) * limit;

  try {
    const { items, total } = await casDUsageOperations.lister(versActeur(auth), filtre, { skip, limit });
    const serializedItems = isClientUser(auth.role)
      ? items.map(versReponseOperationClient)
      : items.map(versReponseOperation);
    return NextResponse.json({ items: serializedItems, total, page, limit });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function POST(_req: NextRequest) {
  void _req;
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;
  return NextResponse.json({ error: "La planification manuelle est désactivée. Enregistrez une collecte réalisée ou importez son fichier Excel." }, { status: 410 });
}
