// src/backend/operations/http/liste.controleur.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { casDUsageOperations } from "../composition";
import type { FiltreOperations } from "../domain/operation";
import { versActeur } from "./acteur";
import { versReponseErreur } from "./erreurs-http";
import { operationSchema, versSaisieOperation } from "./operation.schema";
import { versReponseOperation } from "./presentation";

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
  if (clientId) filtre.clientId = clientId;
  if (siteId) filtre.siteId = siteId;
  if (equipeId) filtre.equipeId = equipeId;
  if (vehiculeId) filtre.vehiculeId = vehiculeId;
  if (statut) filtre.statut = statut;

  const dateDebut = sp.get("dateDebut");
  const dateFin = sp.get("dateFin");
  if (dateDebut) filtre.dateDebut = new Date(dateDebut);
  if (dateFin) filtre.dateFin = new Date(dateFin);

  // Calcul historique, volontairement sans garde-fou (valeurs hors norme renvoyées telles quelles).
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, parseInt(sp.get("limit") || "20", 10));
  const skip = (page - 1) * limit;

  try {
    const { items, total } = await casDUsageOperations.lister(versActeur(auth), filtre, { skip, limit });
    return NextResponse.json({ items: items.map(versReponseOperation), total, page, limit });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = operationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await casDUsageOperations.creer(versActeur(auth), versSaisieOperation(parsed.data));
    return NextResponse.json(versReponseOperation(operation), { status: 201 });
  } catch (erreur) {
    return versReponseErreur(erreur);
  }
}
