import { RecurrenceIntrouvable } from "../domain/erreurs";
import type { RecurrenceRepository } from "../domain/ports";
import type { FiltreRecurrences, Recurrence, RecurrenceSaisie } from "../domain/recurrence";

export interface DependancesRecurrences {
  recurrences: RecurrenceRepository;
}

export function creerCasDUsageRecurrences({ recurrences }: DependancesRecurrences) {
  return {
    lister(filtre: FiltreRecurrences): Promise<Recurrence[]> {
      return recurrences.lister(filtre);
    },

    async obtenir(id: string): Promise<Recurrence> {
      const recurrence = await recurrences.trouverParId(id);
      if (!recurrence) throw new RecurrenceIntrouvable();
      return recurrence;
    },

    creer(saisie: RecurrenceSaisie): Promise<Recurrence> {
      // Aucune vérification que le client, le site ou les ressources existent : identique à la route d'origine.
      return recurrences.creer(saisie);
    },

    async modifier(id: string, saisie: RecurrenceSaisie): Promise<Recurrence> {
      const recurrence = await recurrences.modifier(id, saisie);
      if (!recurrence) throw new RecurrenceIntrouvable();
      return recurrence;
    },

    async supprimer(id: string): Promise<void> {
      if (!(await recurrences.supprimer(id))) throw new RecurrenceIntrouvable();
    },
  };
}

export type CasDUsageRecurrences = ReturnType<typeof creerCasDUsageRecurrences>;
