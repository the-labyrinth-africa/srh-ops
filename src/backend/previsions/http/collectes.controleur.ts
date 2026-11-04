import { NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { listerStationsShell, lireClasseurCollectes, lireHistoriqueCollectes, prevoirCollectes, type HistoriqueCollecte } from "../collectes";

function resultat(mois: string, previsions: Awaited<ReturnType<typeof prevoirCollectes>>, historique: HistoriqueCollecte[]) {
  const stations = listerStationsShell();
  const sitesSources = new Set(historique.map((ligne) => ligne.site));
  const tournees = [...new Set(previsions.map((ligne) => ligne.datePrevue))].map((date) => {
    const lignes = previsions.filter((ligne) => ligne.datePrevue === date);
    return {
      date,
      nom: lignes[0]?.tournee,
      secteur: lignes[0]?.secteur,
      nombreStations: new Set(lignes.map((ligne) => ligne.site)).size,
      volumeEstimeLitres: lignes.reduce((total, ligne) => total + (ligne.quantiteEstimeeLitres ?? 0), 0),
    };
  });
  return {
    mois,
    previsions,
    nombreStations: stations.length,
    stationsAvecHistorique: sitesSources.size,
    stationsSansHistorique: stations.filter((station) => !sitesSources.has(station.site)).map((station) => station.site),
    tournees,
  };
}

export async function GET(request: Request) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const mois = new URL(request.url).searchParams.get("mois") ?? "2026-11";
  try {
    const previsions = await prevoirCollectes(mois);
    const historique = await lireHistoriqueCollectes();
    return NextResponse.json(resultat(mois, previsions, historique));
  } catch {
    return NextResponse.json({ error: "Le mois demandé est invalide." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const mois = String(formData.get("mois") ?? "2026-11");
    const fichiers = formData.getAll("fichiers").filter((value): value is File => value instanceof File);
    const totalOctets = fichiers.reduce((total, fichier) => total + fichier.size, 0);
    if (fichiers.length === 0) return NextResponse.json({ error: "Sélectionnez au moins un bilan Excel." }, { status: 400 });
    if (totalOctets > 20 * 1024 * 1024) return NextResponse.json({ error: "La taille totale des classeurs dépasse 20 Mo." }, { status: 413 });
    if (fichiers.some((fichier) => !fichier.name.toLowerCase().endsWith(".xlsx"))) {
      return NextResponse.json({ error: "Seuls les classeurs .xlsx sont acceptés." }, { status: 400 });
    }

    const historique = (await Promise.all(fichiers.map(async (fichier) =>
      lireClasseurCollectes(fichier.name, new Uint8Array(await fichier.arrayBuffer()))
    ))).flat();
    if (historique.length === 0) return NextResponse.json({ error: "Aucune collecte exploitable trouvée dans les classeurs." }, { status: 400 });
    const previsions = await prevoirCollectes(mois, historique);
    return NextResponse.json({ ...resultat(mois, previsions, historique), collectesLues: historique.length });
  } catch {
    return NextResponse.json({ error: "Lecture impossible. Vérifiez que les classeurs sont valides." }, { status: 400 });
  }
}
