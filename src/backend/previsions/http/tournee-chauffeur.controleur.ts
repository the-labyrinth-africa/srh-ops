import { NextResponse } from "next/server";
import { requireAuth, requireTerrainWrite } from "@/backend/comptes";
import { listerEquipes } from "@/backend/equipes";
import { obtenirUniteQuantiteGlobale } from "@/backend/identite-entreprise";
import { existeOperationCollectee, enregistrerOperationRealisee } from "@/backend/operations";
import { listerVehicules } from "@/backend/vehicules";
import { isChauffeur } from "@/shared/acces/permissions";
import { objectIdSchema } from "@/shared/validators/object-id";
import { z } from "zod";
import { listerAffectationsDuJour, enregistrerPointageTournee } from "../affectations";

const pointageSchema = z.discriminatedUnion("action", [
  z.object({
    affectationId: objectIdSchema("Tournée requise.", "Identifiant de tournée invalide."),
    indexStation: z.number().int().min(0).max(39),
    action: z.literal("arrivee"),
  }),
  z.object({
    affectationId: objectIdSchema("Tournée requise.", "Identifiant de tournée invalide."),
    indexStation: z.number().int().min(0).max(39),
    action: z.literal("depart"),
    quantiteCollectee: z.number().finite().min(0),
  }),
]);

function aujourdhuiISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (!isChauffeur(auth.role) || !auth.equipeId) {
    return NextResponse.json({ error: "Cette vue est réservée aux chauffeurs rattachés à une équipe." }, { status: 403 });
  }

  const [affectations, equipes, vehicules] = await Promise.all([
    listerAffectationsDuJour(aujourdhuiISO(), auth.equipeId),
    listerEquipes(),
    listerVehicules(),
  ]);
  return NextResponse.json({
    affectations: affectations.map((affectation) => ({
      ...affectation,
      equipeNom: equipes.find((equipe) => equipe.id === affectation.equipeId)?.nom ?? "",
      vehiculeIdentification: vehicules.find((vehicule) => vehicule.id === affectation.vehiculeId)?.identification ?? "",
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireTerrainWrite();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Le contenu du pointage doit être un JSON valide." }, { status: 400 });
  }
  const parsed = pointageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Vérifiez le pointage." }, { status: 400 });
  }

  const demande = parsed.data;
  const equipeId = isChauffeur(auth.role) ? auth.equipeId : undefined;
  if (isChauffeur(auth.role) && !equipeId) {
    return NextResponse.json({ error: "Aucune équipe n’est rattachée à ce compte chauffeur." }, { status: 403 });
  }

  if (demande.action === "depart" && demande.quantiteCollectee > 0) {
    const uniteQuantite = await obtenirUniteQuantiteGlobale();
    if (uniteQuantite && uniteQuantite !== "Litres") {
      return NextResponse.json({ error: "Les tournées prévisionnelles sont exprimées en litres. Configurez l’unité de collecte sur Litres pour enregistrer ce passage." }, { status: 400 });
    }
  }

  const resultat = await enregistrerPointageTournee({
    affectationId: demande.affectationId,
    equipeId,
    indexStation: demande.indexStation,
    action: demande.action,
    quantiteCollectee: demande.action === "depart" ? demande.quantiteCollectee : undefined,
    dateAutorisee: isChauffeur(auth.role) ? aujourdhuiISO() : undefined,
  });

  if (!resultat.ok) {
    const erreurs: Record<typeof resultat.code, { message: string; status: number }> = {
      introuvable: { message: "Tournée introuvable.", status: 404 },
      "hors-equipe": { message: "Cette tournée n’est pas affectée à votre équipe.", status: 403 },
      "date-non-autorisee": { message: "Un chauffeur ne peut pointer que la tournée prévue aujourd’hui.", status: 403 },
      "station-invalide": { message: "Cette station ne fait pas partie de la tournée.", status: 400 },
      "arrivee-requise": { message: "Enregistrez l’arrivée avant le départ.", status: 409 },
      "deja-terminee": { message: "La station est déjà terminée avec une autre quantité.", status: 409 },
    };
    const erreur = erreurs[resultat.code];
    return NextResponse.json({ error: erreur.message }, { status: erreur.status });
  }

  let collecteOperationEnregistree = false;
  if (
    demande.action === "depart" &&
    resultat.station.quantiteCollectee !== undefined &&
    resultat.station.quantiteCollectee > 0 &&
    resultat.station.siteId &&
    resultat.station.clientId
  ) {
    const dateHeureDepart = resultat.station.dateHeureDepart!;
    const siteId = String(resultat.station.siteId);
    const quantiteCollectee = resultat.station.quantiteCollectee;
    try {
      if (!(await existeOperationCollectee(siteId, dateHeureDepart, quantiteCollectee))) {
        await enregistrerOperationRealisee({
          clientId: String(resultat.station.clientId),
          siteId,
          natureIntervention: "Collecte d'huiles usagées",
          dateHeurePrevue: dateHeureDepart,
          dateHeureArrivee: resultat.station.dateHeureArrivee,
          dateHeureDepart,
          dureeEstimeeMinutes: resultat.station.dateHeureArrivee
            ? Math.max(0, Math.round((dateHeureDepart.getTime() - resultat.station.dateHeureArrivee.getTime()) / 60_000))
            : 120,
          equipeId: String(resultat.affectation.equipeId),
          vehiculeId: String(resultat.affectation.vehiculeId),
          informationsParticulieres: `Collecte enregistrée depuis ${resultat.affectation.tournee}.`,
          statut: "Rapportée",
          historiqueStatuts: [{ statut: "Rapportée", date: dateHeureDepart }],
          quantiteCollectee,
          uniteQuantite: "Litres",
          remarquesTerrain: "",
        });
      }
      collecteOperationEnregistree = true;
    } catch (error) {
      console.error("Erreur lors de l’enregistrement de la collecte terrain.", error);
      return NextResponse.json({ error: "Le pointage a été enregistré, mais la collecte n’a pas pu être ajoutée à l’historique. Réessayez le même pointage." }, { status: 500 });
    }
  }

  return NextResponse.json({
    affectation: resultat.affectation,
    ...(demande.action === "depart" && demande.quantiteCollectee > 0 ? { collecteOperationEnregistree } : {}),
  });
}
