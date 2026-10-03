import type { OperationStatus } from "@/shared/operations/statuts";
import type { LectureClasseur, LigneImportee } from "./lecture";

export const NATURE_PAR_DEFAUT = "Collecte d'huiles usagées";
export const REMARQUE_OPERATION_IMPORTEE = "Intervention importée depuis un fichier Excel";
export const OBSERVATION_SITE_IMPORTE = "Importé depuis un fichier Excel";
export const TYPE_DECHETS_PAR_DEFAUT = "Huiles usagées";

/** Deux noms de site désignent le même site s'ils sont égaux après cette normalisation. */
export function normaliserNomSite(nom: string): string {
  return nom.trim().toLowerCase();
}

/** Une collecte importée est datée du jour lu dans le classeur, à 08:00 heure locale. */
export function dateHeurePrevueImportee(date: Date): Date {
  const dateHeurePrevue = new Date(date);
  dateHeurePrevue.setHours(8, 0, 0, 0);
  return dateHeurePrevue;
}

/** Historique reconstitué d'une collecte passée (aucun auteur : personne ne l'a saisie dans l'application). */
export function historiqueImporte(dateHeurePrevue: Date): { statut: OperationStatus; date: Date }[] {
  return [
    { statut: "Planifiée", date: new Date(dateHeurePrevue.getTime() - 24 * 3600 * 1000) },
    { statut: "Affectée", date: new Date(dateHeurePrevue.getTime()) },
    { statut: "En route", date: new Date(dateHeurePrevue.getTime() + 30 * 60 * 1000) },
    { statut: "En cours", date: new Date(dateHeurePrevue.getTime() + 60 * 60 * 1000) },
    { statut: "Terminée", date: new Date(dateHeurePrevue.getTime() + 120 * 60 * 1000) },
    { statut: "Rapportée", date: new Date(dateHeurePrevue.getTime() + 180 * 60 * 1000) },
  ];
}

export interface ResumeImport {
  fileName: string;
  totalRows: number;
  skippedRows: number;
  errors: { row: number; message: string }[];
  uniqueSites: number;
  totalQuantite: number;
  uniteApercu: string;
  dateMin: string;
  dateMax: string;
  apercu: LigneImportee[];
}

/** Noms de site distincts, tels que lus (non normalisés), dans l'ordre de première apparition. */
export function sitesDistincts(lecture: LectureClasseur): string[] {
  return [...new Set(lecture.rows.map((r) => r.site))];
}

/** Résumé présenté avant et après l'import. Suppose au moins une ligne exploitable. */
export function resumerLecture(lecture: LectureClasseur): ResumeImport {
  const totalQuantite = lecture.rows.reduce((sum, r) => sum + (r.quantite || 0), 0);
  const dateMin = new Date(Math.min(...lecture.rows.map((r) => r.date.getTime())));
  const dateMax = new Date(Math.max(...lecture.rows.map((r) => r.date.getTime())));

  return {
    fileName: lecture.fileName,
    totalRows: lecture.rows.length,
    skippedRows: lecture.skippedRows,
    errors: lecture.errors,
    uniqueSites: sitesDistincts(lecture).length,
    totalQuantite,
    uniteApercu: "Litres",
    dateMin: dateMin.toISOString(),
    dateMax: dateMax.toISOString(),
    apercu: lecture.rows.slice(0, 10),
  };
}
