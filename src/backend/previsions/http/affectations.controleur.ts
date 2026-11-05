import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalAuth } from "@/backend/comptes";
import { listerTousSites } from "@/backend/clients-sites";
import { listerEquipes } from "@/backend/equipes";
import { listerVehicules } from "@/backend/vehicules";
import { objectIdSchema } from "@/shared/validators/object-id";
import { rapprocherNomStation } from "../collectes";
import { enregistrerAffectationTournee, listerAffectationsDuMois } from "../affectations";
import { calculerPrevisionsCollectes } from "./collectes.controleur";

const affectationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de tournée invalide."),
  tournee: z.string().trim().min(1).max(100),
  equipeId: objectIdSchema("Équipe requise.", "Identifiant d’équipe invalide."),
  vehiculeId: objectIdSchema("Véhicule requis.", "Identifiant de véhicule invalide."),
});

function moisValide(mois: string | null): mois is string {
  return Boolean(mois && /^\d{4}-(0[1-9]|1[0-2])$/.test(mois));
}

function identifiantClient(clientId: string | { id: string; nom: string } | null): string | null {
  if (typeof clientId === "string") return clientId;
  return clientId?.id ?? null;
}

export async function GET(request: Request) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const mois = new URL(request.url).searchParams.get("mois");
  if (!moisValide(mois)) return NextResponse.json({ error: "Le mois demandé est invalide." }, { status: 400 });

  const affectations = await listerAffectationsDuMois(mois);
  return NextResponse.json({ affectations });
}

export async function PUT(request: Request) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Le contenu de l’affectation doit être un JSON valide." }, { status: 400 });
  }
  const parsed = affectationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Vérifiez l’affectation." }, { status: 400 });
  }

  try {
    const { date, tournee, equipeId, vehiculeId } = parsed.data;
    if (date < new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: "Une tournée passée ne peut pas être affectée." }, { status: 400 });
    }
    const mois = date.slice(0, 7);
    const [calculPrevisions, equipes, vehicules, sites] = await Promise.all([
      calculerPrevisionsCollectes(mois),
      listerEquipes(),
      listerVehicules(),
      listerTousSites(),
    ]);
    const previsions = calculPrevisions.previsions;

    const lignes = previsions.filter((ligne) => ligne.datePrevue === date && ligne.tournee === tournee);
    if (!lignes.length) {
      return NextResponse.json({ error: "Cette tournée ne figure plus dans les prévisions. Actualisez le planning." }, { status: 404 });
    }

    const stations = [...new Set(lignes.map((ligne) => ligne.site))];
    if (stations.length < 5) {
      return NextResponse.json({ error: "Une tournée doit comprendre au moins cinq stations distinctes." }, { status: 400 });
    }

    const equipe = equipes.find((item) => item.id === equipeId && item.disponibilite);
    if (!equipe) return NextResponse.json({ error: "L’équipe sélectionnée est introuvable ou indisponible." }, { status: 400 });

    const vehicule = vehicules.find((item) => item.id === vehiculeId && item.disponibilite);
    if (!vehicule) return NextResponse.json({ error: "Le véhicule sélectionné est introuvable ou indisponible." }, { status: 400 });

    const volumeEstimeLitres = lignes.reduce((total, ligne) => total + (ligne.quantiteEstimeeLitres ?? 0), 0);
    if (vehicule.capacite < volumeEstimeLitres) {
      return NextResponse.json({ error: "La capacité du véhicule ne couvre pas le volume estimé de cette tournée." }, { status: 400 });
    }

    const stationsAffectees = lignes.map((ligne) => {
      const correspondances = sites.filter((site) => rapprocherNomStation(site.nom)?.site === ligne.site);
      const correspondance = correspondances.length === 1 ? correspondances[0] : undefined;
      const clientId = correspondance ? identifiantClient(correspondance.clientId) : null;

      return {
        site: ligne.site,
        commune: ligne.commune,
        ...(correspondance && clientId ? { siteId: correspondance.id, clientId } : {}),
        quantiteEstimeeLitres: ligne.quantiteEstimeeLitres ?? 0,
        dureeEstimeeMinutes: ligne.dureeEstimeeMinutes,
      };
    });

    const affectation = await enregistrerAffectationTournee({
      date,
      tournee,
      secteur: lignes[0]?.secteur ?? "",
      equipeId,
      vehiculeId,
      volumeEstimeLitres,
      dureeEstimeeMinutes: lignes.reduce((total, ligne) => total + ligne.dureeEstimeeMinutes, 0),
      stations: stationsAffectees,
    });

    if (!affectation.ok) {
      const erreurs = {
        "tournee-commencee": { message: "Cette tournée a déjà commencé et ne peut plus être réaffectée.", status: 409 },
        "equipe-occupee": { message: "Cette équipe est déjà affectée à une autre tournée ce jour-là.", status: 409 },
        "vehicule-occupe": { message: "Ce véhicule est déjà affecté à une autre tournée ce jour-là.", status: 409 },
      } as const;
      const erreur = erreurs[affectation.code];
      return NextResponse.json({ error: erreur.message }, { status: erreur.status });
    }

    const stationsSansCorrespondance = stationsAffectees
      .filter((station) => !station.siteId || !station.clientId)
      .map((station) => station.site);
    return NextResponse.json({ affectation: affectation.affectation, stationsSansCorrespondance });
  } catch (error) {
    console.error("Erreur lors de l’affectation d’une tournée de collecte.", error);
    return NextResponse.json({ error: "Impossible d’affecter cette tournée." }, { status: 500 });
  }
}
