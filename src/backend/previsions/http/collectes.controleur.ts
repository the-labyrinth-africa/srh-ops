import { NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { obtenirIdentiteEntreprise } from "@/backend/identite-entreprise";
import { listerHistoriqueCollectes } from "@/backend/operations";
import { listerVehicules } from "@/backend/vehicules";
import { listerEquipements } from "@/backend/equipements";
import { listerHistoriqueVisites } from "../affectations";
import { listerStationsShell, prevoirCollectes, rapprocherNomStation, type HistoriqueCollecte } from "../collectes";

function nomReference(reference: unknown): string | undefined {
  if (!reference || typeof reference !== "object") return undefined;
  const nom = (reference as { nom?: unknown }).nom;
  return typeof nom === "string" ? nom : undefined;
}

function resultat(mois: string, previsions: Awaited<ReturnType<typeof prevoirCollectes>>, historique: HistoriqueCollecte[], objectifLitresParStation: number) {
  const stations = listerStationsShell();
  const sitesSources = new Set(historique.map((ligne) => ligne.site));
  const lignesParTournee = new Map<string, typeof previsions>();
  for (const ligne of previsions) {
    const cle = `${ligne.datePrevue}::${ligne.tournee}`;
    lignesParTournee.set(cle, [...(lignesParTournee.get(cle) ?? []), ligne]);
  }
  const tournees = [...lignesParTournee.values()].map((lignes) => {
    const date = lignes[0]?.datePrevue ?? "";
    return {
      date,
      nom: lignes[0]?.tournee,
      secteur: lignes[0]?.secteur,
      nombreStations: new Set(lignes.map((ligne) => ligne.site)).size,
      volumeEstimeLitres: lignes.reduce((total, ligne) => total + (ligne.quantiteEstimeeLitres ?? 0), 0),
      dureeEstimeeMinutes: lignes.reduce((total, ligne) => total + ligne.dureeEstimeeMinutes, 0),
      vehicule: lignes[0]?.vehicule,
      capaciteVehiculeLitres: lignes[0]?.capaciteVehiculeLitres,
      equipements: lignes[0]?.equipements ?? [],
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.nom ?? "").localeCompare(b.nom ?? "", "fr"));
  return {
    mois,
    previsions,
    nombreStations: stations.length,
    stationsAvecHistorique: sitesSources.size,
    stationsSansHistorique: stations.filter((station) => !sitesSources.has(station.site)).map((station) => station.site),
    objectifLitresParStation,
    objectifMensuelLitres: stations.length * objectifLitresParStation,
    tournees,
  };
}

export async function calculerPrevisionsCollectes(mois: string) {
  const [operations, visites, identite, vehicules, equipements] = await Promise.all([
    listerHistoriqueCollectes(), listerHistoriqueVisites(), obtenirIdentiteEntreprise(), listerVehicules(), listerEquipements(),
  ]);
  const historiqueOperations = operations.flatMap((operation) => {
    const siteNom = nomReference(operation.siteId);
    const station = siteNom ? rapprocherNomStation(siteNom) : undefined;
    if (!station || !operation.quantiteCollectee || operation.uniteQuantite !== "Litres") return [];
    return [{
      site: station.site,
      date: operation.dateHeurePrevue,
      quantite: operation.quantiteCollectee,
      dateHeureArrivee: operation.dateHeureArrivee,
      dateHeureDepart: operation.dateHeureDepart,
    }];
  });
  const visitesParCle = new Set(visites.map((visite) => `${visite.site}|${visite.date.toISOString().slice(0, 10)}|${visite.quantite}`));
  const historique = [
    ...historiqueOperations.filter((operation) =>
      !visitesParCle.has(`${operation.site}|${operation.date.toISOString().slice(0, 10)}|${operation.quantite}`)
    ),
    ...visites,
  ];
  const objectif = identite.objectifLitresParStation ?? 2000;
  const previsions = await prevoirCollectes(
    mois,
    historique,
    objectif,
    vehicules.filter((item) => item.disponibilite).map((item) => ({ id: item.id, nom: item.identification, capacite: item.capacite })),
    equipements.filter((item) => item.disponibilite).map((item) => ({ id: item.id, nom: `${item.nom} (${item.type})` }))
  );
  return { previsions, historique, objectif };
}

export async function GET(request: Request) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const mois = new URL(request.url).searchParams.get("mois") ?? new Date().toISOString().slice(0, 7);
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) {
      return NextResponse.json({ error: "Le mois demandé est invalide." }, { status: 400 });
    }
    const { previsions, historique, objectif } = await calculerPrevisionsCollectes(mois);
    return NextResponse.json(resultat(mois, previsions, historique, objectif));
  } catch (error) {
    console.error("Erreur lors du calcul des prévisions de collecte.", error);
    return NextResponse.json({ error: "Impossible de calculer les prévisions pour ce mois." }, { status: 500 });
  }
}
