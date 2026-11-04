import "server-only";
import ExcelJS from "exceljs";
import passagesFournis from "./historique-fourni.json";
import stationsFournies from "./stations-shell-2026.json";

export interface StationShell {
  numero: number;
  commune: string;
  site: string;
}

export interface HistoriqueCollecte {
  site: string;
  date: Date;
  quantite: number;
}

export interface PrevisionCollecte {
  site: string;
  commune: string;
  datePrevue: string;
  derniereCollecte?: string;
  intervalleEstimeJours: number;
  quantiteEstimeeLitres?: number;
  passagesHistoriques: number;
  confiance: "élevée" | "moyenne" | "faible";
  tournee: string;
  secteur: string;
}

const ALIAS_SITES: Record<string, string> = {
  "7ETRAZNCHE1": "ANGRE7ETRANCHE1",
  "7ETRANCHE1": "ANGRE7ETRANCHE1",
  "ANGRE7ETRANCHE2": "7ETRANCHE2",
  "ANGRE8ETRANCHE": "LAANGRE8ETRANCHE",
  "8ETRANCHE": "LAANGRE8ETRANCHE",
  LA8ETRANCHE: "LAANGRE8ETRANCHE",
  ANONO: "SHELLANONO",
  SSANGRECHU: "ANGRECHU",
  SAINTJEAN: "STJEANT",
  STJEAN: "STJEANT",
  COCODYSTJEAN: "STJEANT",
  POABATA: "POABATTA",
  ABATA: "POABATTA",
  GFCI: "GFCI2",
  "GFCI2": "GFCI2",
  STETHERESE: "SAINTETHERESE",
  CHRISTIANI: "AVENUECHRISTIANI",
  AUTOROUTE: "AUTOROUTESUD",
  ZONEINDUSTRIELLE: "ZINDUSTRIELLE",
  KOUMASSIZI: "ZINDUSTRIELLE",
  SHELLROUME: "ROUME",
  SSROUME: "ROUME",
  SSPARIS: "PARIS",
  SSSORTIERUEDESJARDINS: "RUEDESJARDINS",
  LATRIILLEB: "LATRILLEB",
  LATRILLMEA: "LATRILLEA",
  LATB: "LATRILLEB",
  LAANONO: "SHELLANONO",
  SSPROMOTO: "SSPREMOTO",
  PREMOTO: "SSPREMOTO",
  LAKOUMASSI: "CAMPCOMMANDO",
};

function cleSite(nom: string): string {
  return nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const STATIONS = stationsFournies as StationShell[];
const STATION_PAR_CLE = new Map(STATIONS.map((station) => [cleSite(station.site), station]));

function rapprocherSite(nom: string): StationShell | undefined {
  const cle = cleSite(nom);
  return STATION_PAR_CLE.get(ALIAS_SITES[cle] ?? cle);
}

/** Référentiel officiel des 40 stations fourni par SRH. */
export function listerStationsShell(): StationShell[] {
  return STATIONS;
}

/** Historique compact des bilans fournis, limité aux sites du référentiel officiel. */
export async function lireHistoriqueCollectes(): Promise<HistoriqueCollecte[]> {
  return passagesFournis.map(({ site, date, quantite }) => ({
    site,
    date: new Date(`${date}T12:00:00Z`),
    quantite,
  }));
}

/** Lit les feuilles de bilan utilisées jusque-là et rapproche les noms au référentiel des stations. */
export async function lireClasseurCollectes(nom: string, contenu: Uint8Array): Promise<HistoriqueCollecte[]> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(contenu as unknown as ExcelJS.Buffer);
  const feuille = classeur.worksheets[0];
  if (!feuille) return [];

  const fichier = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const bilanAout = fichier.includes("aout");
  const recapAncien = fichier.includes("juin") || fichier.includes("septembre");
  const historique: HistoriqueCollecte[] = [];
  for (let index = 1; index <= feuille.rowCount; index++) {
    const valeurs = feuille.getRow(index).values as ExcelJS.CellValue[];
    const nomSite = bilanAout ? valeurs[9] : recapAncien ? valeurs[1] : valeurs[2];
    const dateBrute = bilanAout ? valeurs[7] : recapAncien ? valeurs[2] : valeurs[3];
    const quantite = bilanAout ? valeurs[10] : recapAncien ? valeurs[3] : valeurs[4];
    if (typeof nomSite !== "string" || typeof quantite !== "number" || quantite <= 0) continue;
    const station = rapprocherSite(nomSite);
    if (!station) continue;
    const date = dateBrute instanceof Date
      ? dateBrute
      : typeof dateBrute === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateBrute)
        ? new Date(`${dateBrute.slice(0, 10)}T12:00:00Z`)
        : null;
    if (date && !Number.isNaN(date.getTime())) historique.push({ site: station.site, date, quantite });
  }
  return historique;
}

function jourISO(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function mediane(valeurs: number[]): number {
  const tries = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  return Math.round(tries.length % 2 ? tries[milieu] : (tries[milieu - 1] + tries[milieu]) / 2);
}

function secteurDe(commune: string): "Nord" | "Sud" | "Centre" {
  if (["COCODY", "BINGERVILLE", "SONGON"].includes(commune.toUpperCase())) return "Nord";
  if (["MARCORY", "PORT-BOUET"].includes(commune.toUpperCase())) return "Sud";
  return "Centre";
}

function dateTournee(mois: string, jour: number): Date {
  const [annee, moisNumero] = mois.split("-").map(Number);
  const dernierJour = new Date(Date.UTC(annee, moisNumero, 0)).getUTCDate();
  let date = new Date(Date.UTC(annee, moisNumero - 1, Math.min(jour, dernierJour)));
  // L'historique contient des tournées le samedi, mais pas le dimanche.
  if (date.getUTCDay() === 0) date = new Date(Date.UTC(annee, moisNumero - 1, Math.min(jour + 1, dernierJour)));
  return date;
}

interface ProfilStation {
  station: StationShell;
  dates: Date[];
  intervalle: number;
  volume?: number;
  confiance: PrevisionCollecte["confiance"];
  passages: number;
}

function profilsStations(historique: HistoriqueCollecte[]): ProfilStation[] {
  return STATIONS.map((station) => {
    const passages = historique.filter((ligne) => ligne.site === station.site);
    const dates = [...new Map(passages.map((ligne) => [jourISO(ligne.date), ligne.date])).values()].sort((a, b) => a.getTime() - b.getTime());
    const intervalles = dates.slice(1)
      .map((date, index) => Math.round((date.getTime() - dates[index].getTime()) / 86_400_000))
      .filter((jours) => jours >= 7 && jours <= 35)
      .slice(-4);
    const intervalle = intervalles.length ? mediane(intervalles) : 30;
    const volumes = passages.map((passage) => passage.quantite).sort((a, b) => a - b);
    const volume = volumes.length ? Math.round(mediane(volumes)) : undefined;
    const confiance = intervalles.length >= 3 ? "élevée" : intervalles.length ? "moyenne" : "faible";
    return { station, dates, intervalle, volume, confiance, passages: passages.length };
  });
}

/** Répartit les stations par volume décroissant, en équilibrant les litres estimés des groupes. */
function repartirParVolume(profils: ProfilStation[], nombreGroupes: number): ProfilStation[][] {
  const groupes = Array.from({ length: nombreGroupes }, () => [] as ProfilStation[]);
  const volumes = Array.from({ length: nombreGroupes }, () => 0);
  const tries = [...profils].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0) || a.station.site.localeCompare(b.station.site, "fr"));
  for (const profil of tries) {
    let index = 0;
    for (let candidate = 1; candidate < groupes.length; candidate++) {
      if (volumes[candidate] < volumes[index] || (volumes[candidate] === volumes[index] && groupes[candidate].length < groupes[index].length)) {
        index = candidate;
      }
    }
    groupes[index].push(profil);
    volumes[index] += profil.volume ?? 0;
  }
  return groupes;
}

function profilVisite(
  profil: ProfilStation,
  mois: string,
  jourTournee: number,
  tournee: string,
  secteur: string
): PrevisionCollecte {
  const derniere = profil.dates.at(-1);
  const datePrevue = dateTournee(mois, jourTournee);
  return {
    site: profil.station.site,
    commune: profil.station.commune,
    datePrevue: jourISO(datePrevue),
    derniereCollecte: derniere ? jourISO(derniere) : undefined,
    intervalleEstimeJours: profil.intervalle,
    quantiteEstimeeLitres: profil.volume,
    passagesHistoriques: profil.passages,
    confiance: profil.confiance,
    tournee,
    secteur,
  };
}

/** Construit des tournées par secteurs proches, avec au moins cinq stations sur chaque date. */
export async function prevoirCollectes(mois: string, historiqueSaisi?: HistoriqueCollecte[]): Promise<PrevisionCollecte[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw new Error("Mois invalide");
  const historique = historiqueSaisi ?? await lireHistoriqueCollectes();
  const profils = profilsStations(historique);
  const nord = profils.filter((profil) => secteurDe(profil.station.commune) === "Nord");
  const sud = profils.filter((profil) => secteurDe(profil.station.commune) === "Sud");
  const centre = profils.filter((profil) => secteurDe(profil.station.commune) === "Centre");
  const tournees: { date: number; nom: string; secteur: string; sites: ProfilStation[] }[] = [];

  const groupesNord = repartirParVolume(nord, 2);
  tournees.push({ date: 5, nom: "Nord 1", secteur: "Cocody · Bingerville · Songon", sites: groupesNord[0] });
  tournees.push({ date: 6, nom: "Nord 2", secteur: "Cocody · Bingerville · Songon", sites: groupesNord[1] });
  tournees.push({ date: 7, nom: "Sud", secteur: "Marcory · Port-Bouët", sites: sud });
  tournees.push({ date: 10, nom: "Centre", secteur: "Treichville · Plateau · Koumassi", sites: centre });

  const repetitionsNord = nord.filter((profil) => profil.passages >= 3 && profil.intervalle <= 21);
  if (repetitionsNord.length >= 5) {
    const nombreGroupes = repetitionsNord.length >= 10 ? 2 : 1;
    const groupes = repartirParVolume(repetitionsNord, nombreGroupes);
    groupes.forEach((sites, index) => tournees.push({
      date: index === 0 ? 19 : 20,
      nom: `Nord ${index + 1} — second passage`,
      secteur: "Cocody · Bingerville · Songon",
      sites,
    }));
  }

  const repetitionsCentreSud = [...sud, ...centre].filter((profil) => profil.passages >= 3 && profil.intervalle <= 21);
  if (repetitionsCentreSud.length >= 5) {
    const nombreGroupes = repetitionsCentreSud.length >= 10 ? 2 : 1;
    const groupes = repartirParVolume(repetitionsCentreSud, nombreGroupes);
    groupes.forEach((sites, index) => tournees.push({
      date: index === 0 ? 24 : 25,
      nom: `Centre-Sud ${index + 1} — second passage`,
      secteur: "Treichville · Plateau · Koumassi · Marcory",
      sites,
    }));
  }

  const resultats = tournees.flatMap((tournee) => tournee.sites.map((profil) =>
    profilVisite(profil, mois, tournee.date, tournee.nom, tournee.secteur)
  ));

  // Une visite d'une même station ne peut pas être proposée deux fois lors d'une même tournée.
  const visitesUniques = [...new Map(resultats.map((visite) => [`${visite.site}-${visite.datePrevue}`, visite])).values()];
  return visitesUniques.sort((a, b) => a.datePrevue.localeCompare(b.datePrevue) || a.tournee.localeCompare(b.tournee, "fr") || a.site.localeCompare(b.site, "fr"));
}
