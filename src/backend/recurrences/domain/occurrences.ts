import type { RecurrencePlanifiable } from "./recurrence";

/** Borne de sécurité sur le parcours des occurrences d'une récurrence. */
export const MAX_OCCURRENCES_SCAN = 1000;

const HORIZON_PAR_DEFAUT = 30;

/**
 * Horizon de génération : 30 jours par défaut, borné entre 1 et 90. Une valeur absente, nulle ou
 * non numérique donne l'horizon par défaut (jamais `NaN` : une date de fin invalide ne bornerait
 * plus la génération).
 */
export function horizonEnJours(valeur: unknown): number {
  const nombre = typeof valeur === "number" || typeof valeur === "string" ? Number(valeur) : NaN;
  const jours = Number.isFinite(nombre) && nombre !== 0 ? nombre : HORIZON_PAR_DEFAUT;
  return Math.min(90, Math.max(1, jours));
}

export function finHorizon(maintenant: Date, jours: number): Date {
  const fin = new Date(maintenant);
  fin.setDate(fin.getDate() + jours);
  return fin;
}

/**
 * Occurrences d'une récurrence « personnalisée ».
 *
 * L'ancre est la dernière occurrence réellement générée (`derniereGeneration`), à défaut la
 * création de la récurrence : l'intervalle ne repart jamais de la date d'exécution, ce qui ferait
 * glisser les dates et pourrait dupliquer des occurrences d'un jour sur l'autre.
 */
function occurrencesPersonnalisees(
  rec: RecurrencePlanifiable,
  maintenant: Date,
  fin: Date,
  heures: number,
  minutes: number
): Date[] {
  const occurrences: Date[] = [];
  // Sans date de fin valide, la boucle ci-dessous ne s'arrêterait qu'à la borne de sécurité.
  if (Number.isNaN(fin.getTime())) return occurrences;

  const intervalle = rec.intervalleJours || 7;
  const ancre = new Date(rec.derniereGeneration || rec.createdAt);

  // Une récurrence dormante (ancre très ancienne) ne doit pas épuiser la borne de sécurité dans le
  // passé : on démarre au dernier rang possiblement encore dû. Le `- 1` couvre l'heure prévue
  // postérieure à l'heure de l'ancre (une occurrence du rang `ceil - 1` peut encore être à venir
  // le jour même).
  const premierRang = Math.max(
    1,
    Math.ceil((maintenant.getTime() - ancre.getTime()) / (intervalle * 86_400_000)) - 1
  );

  for (let k = premierRang; k < premierRang + MAX_OCCURRENCES_SCAN; k++) {
    const prevue = new Date(ancre);
    prevue.setDate(prevue.getDate() + intervalle * k);
    prevue.setHours(heures, minutes, 0, 0);

    if (prevue > fin) break;
    if (prevue >= maintenant) occurrences.push(prevue);
  }

  return occurrences;
}

/** Occurrences des récurrences hebdomadaires / mensuelles, par balayage des jours. */
function occurrencesCalendaires(
  rec: RecurrencePlanifiable,
  maintenant: Date,
  fin: Date,
  heures: number,
  minutes: number
): Date[] {
  const occurrences: Date[] = [];
  const jourCourant = new Date(maintenant);
  jourCourant.setHours(0, 0, 0, 0);

  while (jourCourant <= fin) {
    let correspond = false;

    if (rec.frequence === "hebdomadaire") {
      correspond = rec.jourSemaine !== undefined && jourCourant.getDay() === rec.jourSemaine;
    } else if (rec.frequence === "mensuelle") {
      correspond = rec.jourMois !== undefined && jourCourant.getDate() === rec.jourMois;
    }

    if (correspond) {
      const prevue = new Date(jourCourant);
      prevue.setHours(heures, minutes, 0, 0);
      if (prevue >= maintenant) occurrences.push(prevue);
    }

    jourCourant.setDate(jourCourant.getDate() + 1);
  }

  return occurrences;
}

/** Dates (heure locale) auxquelles la récurrence doit produire une opération entre `maintenant` et `fin`. */
export function occurrencesDe(rec: RecurrencePlanifiable, maintenant: Date, fin: Date): Date[] {
  const [heures, minutes] = (rec.heurePrevue || "08:00").split(":").map(Number);
  return rec.frequence === "personnalisee"
    ? occurrencesPersonnalisees(rec, maintenant, fin, heures, minutes)
    : occurrencesCalendaires(rec, maintenant, fin, heures, minutes);
}
