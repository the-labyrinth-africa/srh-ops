import { finHorizon, occurrencesDe } from "../domain/occurrences";
import type { Horloge, OperationsRecurrentes, RecurrenceRepository } from "../domain/ports";

export interface DependancesGeneration {
  recurrences: RecurrenceRepository;
  operations: OperationsRecurrentes;
  horloge: Horloge;
}

export interface ConflitGeneration {
  recurrenceId: string;
  date: string;
  message: string;
}

export interface ResultatGeneration {
  generatedCount: number;
  conflits: ConflitGeneration[];
}

/**
 * Génère les opérations dues des récurrences actives, de maintenant à maintenant + `horizonJours`.
 * Sans doublon (une opération déjà présente pour le même client, le même site et la même date est
 * ignorée) ; un conflit d'affectation ne bloque jamais la génération.
 */
export function creerGenerationOccurrences({ recurrences, operations, horloge }: DependancesGeneration) {
  return async function genererOccurrences(parUtilisateur: string, horizonJours: number): Promise<ResultatGeneration> {
    const actives = await recurrences.listerActives();

    const maintenant = horloge.maintenant();
    const fin = finHorizon(maintenant, horizonJours);

    let generatedCount = 0;
    const conflits: ConflitGeneration[] = [];

    for (const rec of actives) {
      let derniereCreee: Date | null = null;

      for (const dateHeurePrevue of occurrencesDe(rec, maintenant, fin)) {
        // Éviter les doublons sur le même site à la même date/heure.
        if (await operations.existeSurCreneau(rec.clientId, rec.siteId, dateHeurePrevue)) continue;

        // I7 : la génération respecte la détection de conflits. En cas de chevauchement,
        // l'occurrence est créée sans ressource, à replanifier.
        let equipeId = rec.equipeId;
        let vehiculeId = rec.vehiculeId;
        const dureeEstimeeMinutes = rec.dureeEstimeeMinutes || 120;

        const detectes = await operations.verifierConflits({ dateHeurePrevue, dureeEstimeeMinutes, equipeId, vehiculeId });

        const bloquants = detectes.filter((conflit) => conflit.hasConflict);
        if (bloquants.length > 0) {
          conflits.push({
            recurrenceId: rec.id,
            date: dateHeurePrevue.toISOString(),
            message: bloquants.map((conflit) => conflit.message).filter(Boolean).join(" ; "),
          });
          equipeId = undefined;
          vehiculeId = undefined;
        }

        await operations.creer(
          {
            clientId: rec.clientId,
            siteId: rec.siteId,
            natureIntervention: rec.natureIntervention,
            dateHeurePrevue,
            dureeEstimeeMinutes,
            equipeId,
            vehiculeId,
            equipementIds: rec.equipementIds || [],
            informationsParticulieres: rec.informationsParticulieres || "",
          },
          parUtilisateur
        );

        generatedCount++;
        if (!derniereCreee || dateHeurePrevue > derniereCreee) derniereCreee = dateHeurePrevue;
      }

      // I6 : l'ancre n'avance que si une occurrence a réellement été créée, et elle porte la date
      // de l'occurrence, pas la date d'exécution.
      if (derniereCreee) await recurrences.avancerAncre(rec.id, derniereCreee);
    }

    return { generatedCount, conflits };
  };
}
