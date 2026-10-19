import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/comptes";
import { listerSitesDuClient, siteAppartientAuClient } from "@/backend/clients-sites";
import { isClientUser } from "@/shared/acces/permissions";
import type { Acteur } from "@/shared/acces/acteur";
import type { FiltreOperations } from "@/backend/operations";
import { creerOperationDemande, listerOperationsPourActeur } from "@/backend/operations";
import { versOperationClientJson } from "@/shared/operations/operation-client-view";
import { demandeOperationClientSchema } from "./schemas";

async function clientActeur() {
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error } as const;
  if (!isClientUser(auth.role)) {
    return { error: NextResponse.json({ error: "Accès réservé aux clients." }, { status: 403 }) } as const;
  }
  const acteur: Acteur = {
    id: auth.user.id,
    role: auth.role,
    clientId: auth.clientId,
    equipeId: auth.equipeId,
  };
  return { auth, acteur } as const;
}

export async function dashboard() {
  const result = await clientActeur();
  if (result.error) return result.error;
  const { acteur } = result;
  const pagination = { skip: 0, limit: 8 };
  const [recent, demandes, terminees, rapportees] = await Promise.all([
    listerOperationsPourActeur(acteur, {}, pagination),
    listerOperationsPourActeur(acteur, { statut: "Demande" }, { skip: 0, limit: 1 }),
    listerOperationsPourActeur(acteur, { statut: "Terminée" }, { skip: 0, limit: 1 }),
    listerOperationsPourActeur(acteur, { statut: "Rapportée" }, { skip: 0, limit: 1 }),
  ]);
  return NextResponse.json(
    {
      total: recent.total,
      demandesEnAttente: demandes.total,
      terminees: terminees.total + rapportees.total,
      recent: recent.items.map(versOperationClientJson),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function operations(request: NextRequest) {
  const result = await clientActeur();
  if (result.error) return result.error;
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get("limit") || "20", 10) || 20));
  const statut = params.get("statut") || undefined;
  const filtre: FiltreOperations = {};
  if (statut) filtre.statut = statut;

  const { items, total } = await listerOperationsPourActeur(
    result.acteur,
    filtre,
    { skip: (page - 1) * limit, limit }
  );
  return NextResponse.json(
    { items: items.map(versOperationClientJson), total, page, limit },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function sites() {
  const result = await clientActeur();
  if (result.error) return result.error;
  const clientId = result.acteur.clientId;
  if (!clientId) return NextResponse.json({ error: "Compte client sans périmètre attribué." }, { status: 403 });
  const items = await listerSitesDuClient(clientId);
  return NextResponse.json(
    items.map((site) => ({
      id: site.id,
      nom: site.nom,
      adresse: site.adresse,
      typeDechets: site.typeDechets,
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function demanderOperation(request: NextRequest) {
  const result = await clientActeur();
  if (result.error) return result.error;
  const body: unknown = await request.json().catch((error: unknown) => {
    if (error instanceof SyntaxError) return null;
    throw error;
  });
  if (body === null) return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  const parsed = demandeOperationClientSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const clientId = result.acteur.clientId;
  if (!clientId) return NextResponse.json({ error: "Compte client sans périmètre attribué." }, { status: 403 });
  if (!(await siteAppartientAuClient(parsed.data.siteId, clientId))) {
    return NextResponse.json({ error: "Le site sélectionné n'appartient pas à votre compte." }, { status: 404 });
  }

  const operation = await creerOperationDemande(
    {
      clientId,
      siteId: parsed.data.siteId,
      natureIntervention: parsed.data.natureIntervention,
      dateHeurePrevue: parsed.data.dateSouhaitee,
      dureeEstimeeMinutes: 120,
      equipementIds: [],
      informationsParticulieres: parsed.data.informationsParticulieres,
      uniteQuantite: "Litres",
      remarquesTerrain: "",
      nomSignataireClient: "",
      signatureClient: "",
    },
    result.acteur.id
  );
  return NextResponse.json(versOperationClientJson(operation), { status: 201 });
}
