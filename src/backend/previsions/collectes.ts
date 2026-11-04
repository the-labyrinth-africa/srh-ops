import "server-only";
import ExcelJS from "exceljs";
import passagesFournis from "./historique-fourni.json";

export interface HistoriqueCollecte {
  site: string;
  date: Date;
}

export interface PrevisionCollecte {
  site: string;
  datePrevue: string;
  derniereCollecte: string;
  intervalleEstimeJours: number;
  passagesHistoriques: number;
  confiance: "élevée" | "moyenne" | "faible";
}

const ALIAS_SITES: Record<string, string> = {
  "ANGRE 7E TRANCHE1": "ANGRE 7E TRANCHE 1", "7E TRAZNCHE 1": "ANGRE 7E TRANCHE 1", "7E TRANCHE 1": "ANGRE 7E TRANCHE 1",
  "LA 8E TRANCHE": "8E TRANCHE", "LA ANGRE 8E TRANCHE": "8E TRANCHE", "ANGRE 8E TRANCHE": "8E TRANCHE",
  "SS ANGRE CHU": "ANGRE CHU", "STE THERESE": "SAINTE THERESE", "SAINT THERESE": "SAINTE THERESE",
  "Z.INDUSTRIELLE": "ZONE INDUSTRIELLE", "Z-INDUSTRIELLE": "ZONE INDUSTRIELLE", "KOUMASSI ZI": "ZONE INDUSTRIELLE",
  GFCI: "GFCI 2", GFCI2: "GFCI 2", CHRISTIANI: "AVENUE CHRISTIANI", "ST JEANT": "SAINT JEAN", "ST JEAN": "SAINT JEAN",
  "COCODY ST JEAN": "SAINT JEAN", ABATA: "PO ABATTA", "AERO-CITE": "AERO CITE", "SHELL ANONO": "ANONO", "LA ANONO": "ANONO",
  "SS PARIS": "PARIS", "SHELL ROUME": "ROUME", "SS ROUME": "ROUME", "SS SORTIE RUE DES JARDINS": "RUE DES JARDINS",
  PREMOTO: "SS PREMOTO", "SS PROMOTO": "SS PREMOTO", "LATRIILLE B": "LATRILLE B", "LATRILLME A": "LATRILLE A",
  "ANGRE 7E TRANCHE 2": "7E TRANCHE 2", "LA KOUMASSI": "KOUMASSI",
};

function normaliserSite(nom: string): string {
  const normalise = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
  return ALIAS_SITES[normalise] ?? normalise;
}

/** Lit un bilan Excel avec les colonnes usuelles site/date/quantité. */
export async function lireClasseurCollectes(nom: string, contenu: Uint8Array): Promise<HistoriqueCollecte[]> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(contenu as unknown as ExcelJS.Buffer);
  const feuille = classeur.worksheets[0];
  if (!feuille) return [];

  const lignes: HistoriqueCollecte[] = [];
  const nomNormalise = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const estBilanAout = nomNormalise.includes("aout");
  const estRecapAncien = nomNormalise.includes("juin") || nomNormalise.includes("septembre");
  for (let index = 1; index <= feuille.rowCount; index++) {
    const valeurs = feuille.getRow(index).values as ExcelJS.CellValue[];
    const site = estBilanAout ? valeurs[9] : estRecapAncien ? valeurs[1] : valeurs[2];
    const dateBrute = estBilanAout ? valeurs[7] : estRecapAncien ? valeurs[2] : valeurs[3];
    const quantite = estBilanAout ? valeurs[10] : estRecapAncien ? valeurs[3] : valeurs[4];
    if (typeof site !== "string" || typeof quantite !== "number" || quantite <= 0) continue;
    const date = dateBrute instanceof Date
      ? dateBrute
      : typeof dateBrute === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateBrute)
        ? new Date(`${dateBrute.slice(0, 10)}T12:00:00Z`)
        : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    lignes.push({ site: normaliserSite(site), date });
  }
  return lignes;
}

function jourISO(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Historique compact dérivé des quatre classeurs fournis (seuls site et jour sont conservés). */
export async function lireHistoriqueCollectes(): Promise<HistoriqueCollecte[]> {
  return passagesFournis.map(({ site, date }) => ({ site, date: new Date(`${date}T12:00:00Z`) }));
}

function mediane(valeurs: number[]): number {
  const tries = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  return Math.round(tries.length % 2 ? tries[milieu] : (tries[milieu - 1] + tries[milieu]) / 2);
}

/** Extrapole une cadence robuste (médiane des intervalles de 7 à 35 jours) jusqu'au mois choisi. */
export async function prevoirCollectes(mois: string, historiqueSaisi?: HistoriqueCollecte[]): Promise<PrevisionCollecte[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw new Error("Mois invalide");
  const [annee, moisNumero] = mois.split("-").map(Number);
  const debut = new Date(Date.UTC(annee, moisNumero - 1, 1));
  const fin = new Date(Date.UTC(annee, moisNumero, 0));
  const maintenant = new Date();
  const aujourdHui = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  const premiereDate = debut.getUTCFullYear() === aujourdHui.getUTCFullYear() && debut.getUTCMonth() === aujourdHui.getUTCMonth()
    ? aujourdHui
    : debut;
  const historique = historiqueSaisi ?? await lireHistoriqueCollectes();
  const parSite = new Map<string, Date[]>();
  for (const ligne of historique) {
    const dates = parSite.get(ligne.site) ?? [];
    dates.push(ligne.date);
    parSite.set(ligne.site, dates);
  }

  const resultats: PrevisionCollecte[] = [];
  for (const [site, datesBrutes] of parSite) {
    const dates = [...new Map(datesBrutes.map((date) => [jourISO(date), date])).values()].sort((a, b) => a.getTime() - b.getTime());
    if (!dates.length) continue;
    const intervalles = dates.slice(1).map((date, index) => Math.round((date.getTime() - dates[index].getTime()) / 86_400_000)).filter((jours) => jours >= 7 && jours <= 35).slice(-4);
    const intervalle = intervalles.length ? mediane(intervalles) : 30;
    const derniere = dates[dates.length - 1];
    let candidate = new Date(Date.UTC(derniere.getUTCFullYear(), derniere.getUTCMonth(), derniere.getUTCDate()));
    for (let essai = 0; essai < 24; essai++) {
      candidate = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate() + intervalle));
      if (candidate > fin) break;
      if (candidate >= premiereDate) {
        const prevue = new Date(candidate);
        // Les historiques fournis contiennent des tournées le samedi, mais aucune le dimanche.
        if (prevue.getUTCDay() === 0) {
          prevue.setUTCDate(prevue.getUTCDate() === debut.getUTCDate() ? prevue.getUTCDate() + 1 : prevue.getUTCDate() - 1);
        }
        resultats.push({
          site,
          datePrevue: jourISO(prevue),
          derniereCollecte: jourISO(derniere),
          intervalleEstimeJours: intervalle,
          passagesHistoriques: dates.length,
          confiance: intervalles.length >= 3 ? "élevée" : intervalles.length >= 1 ? "moyenne" : "faible",
        });
      }
    }
  }
  return resultats.sort((a, b) => a.datePrevue.localeCompare(b.datePrevue) || a.site.localeCompare(b.site, "fr"));
}
