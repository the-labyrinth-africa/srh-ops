/** Une collecte lue dans le classeur. */
export interface LigneImportee {
  site: string;
  date: Date;
  quantite: number;
  rowNumber: number;
}

/** Résultat de la lecture d'un classeur : lignes exploitables (triées par date), lignes ignorées, erreurs. */
export interface LectureClasseur {
  rows: LigneImportee[];
  skippedRows: number;
  errors: { row: number; message: string }[];
  fileName: string;
}

export const ENTETES_SITE = ["site", "sites", "nom du site", "nom de site", "nom site", "point de collecte", "points", "site d'intervention", "collecte", "ville", "quartier"];
export const ENTETES_DATE = ["date", "dates", "date de collecte", "date prevue", "date prévue", "date intervention", "jour", "journee", "journée"];
export const ENTETES_QUANTITE = ["qte", "qtes", "quantite", "quantite", "quantité", "qté", "volume", "litres", "l", "quantite collectee", "quantité collectée", "valeur"];

function normaliserEntete(valeur: string): string {
  return valeur
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9êéèàô/]/g, "")
    .trim();
}

/** Tolérant : égalité, ou inclusion dans un sens ou dans l'autre, après normalisation. */
export function correspondAUnEntete(valeur: string, entetes: string[]): boolean {
  const norm = normaliserEntete(valeur);
  if (!norm) return false;
  return entetes.some(
    (h) => norm === normaliserEntete(h) || norm.includes(normaliserEntete(h)) || normaliserEntete(h).includes(norm)
  );
}

export function interpreterDate(valeur: unknown, ligne: number): { date?: Date; error?: string } {
  if (valeur instanceof Date) return { date: valeur };
  if (typeof valeur === "number") {
    // Numéro de série Excel (jours depuis le 1er janvier 1900).
    const date = new Date(Math.round((valeur - 25569) * 86400 * 1000));
    return { date };
  }
  if (typeof valeur === "string") {
    const trimmed = valeur.trim();

    // Format français d'abord : "05/06/2026" est le 5 juin, pas le 6 mai.
    // `new Date(string)` interprète jj/mm/aaaa comme mm/jj/aaaa et doit donc
    // être essayé en dernier seulement.
    const fr = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (fr) {
      const day = Number(fr[1]);
      const month = Number(fr[2]);
      const year = fr[3].length === 2 ? 2000 + Number(fr[3]) : Number(fr[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const parsed = new Date(year, month - 1, day);
        if (!isNaN(parsed.getTime())) return { date: parsed };
      }
      return { error: `Date invalide à la ligne ${ligne}: "${valeur}"` };
    }

    // Format ISO aaaa-mm-jj : construit en heure locale pour éviter le décalage
    // d'un jour introduit par l'interprétation UTC de `new Date`.
    const iso = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (iso) {
      const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      if (!isNaN(parsed.getTime())) return { date: parsed };
    }

    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return { date };

    return { error: `Date invalide à la ligne ${ligne}: "${valeur}"` };
  }
  return { error: `Date non reconnue à la ligne ${ligne}` };
}

/**
 * Renvoie `quantite: undefined` quand la cellule est vide. Le client SRH n'a pas
 * de collecte à quantité nulle : une absence de quantité n'est pas un zéro.
 */
export function interpreterQuantite(valeur: unknown, ligne: number): { quantite?: number; error?: string } {
  if (valeur === undefined || valeur === null || valeur === "") return {};
  if (typeof valeur === "number") return { quantite: valeur };
  if (typeof valeur === "string") {
    const num = parseFloat(valeur.replace(",", ".").replace(/[^0-9.\-]/g, ""));
    if (!isNaN(num)) return { quantite: num };
  }
  return { error: `Quantité invalide à la ligne ${ligne}: "${String(valeur)}"` };
}
