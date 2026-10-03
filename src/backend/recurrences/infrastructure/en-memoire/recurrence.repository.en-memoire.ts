import type { FiltreRecurrences, Recurrence, RecurrencePlanifiable, RecurrenceSaisie } from "../../domain/recurrence";
import type { RecurrenceRepository } from "../../domain/ports";

/** Dépôt en mémoire : sert aux tests des cas d'usage. Les relations y restent des identifiants bruts. */
export class RecurrenceRepositoryEnMemoire implements RecurrenceRepository {
  private readonly donnees = new Map<string, Recurrence>();
  private compteur = 0;
  /** Filtres reçus par `lister`, dans l'ordre des appels. */
  readonly filtresRecus: FiltreRecurrences[] = [];
  /** Récurrences renvoyées par `listerActives` (à préparer par le test). */
  actives: RecurrencePlanifiable[] = [];
  /** Appels à `avancerAncre`, dans l'ordre. */
  readonly ancres: { id: string; derniereGeneration: Date }[] = [];

  async lister(filtre: FiltreRecurrences): Promise<Recurrence[]> {
    this.filtresRecus.push(filtre);
    return [...this.donnees.values()].reverse();
  }

  async trouverParId(id: string): Promise<Recurrence | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: RecurrenceSaisie): Promise<Recurrence> {
    this.compteur += 1;
    const maintenant = new Date();
    const recurrence: Recurrence = {
      ...saisie,
      id: `recurrence-${this.compteur}`,
      createdAt: maintenant,
      updatedAt: maintenant,
      revision: 0,
    };
    this.donnees.set(recurrence.id, recurrence);
    return recurrence;
  }

  async modifier(id: string, saisie: RecurrenceSaisie): Promise<Recurrence | null> {
    const existante = this.donnees.get(id);
    if (!existante) return null;
    const modifiee: Recurrence = { ...existante, ...saisie };
    this.donnees.set(id, modifiee);
    return modifiee;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }

  async listerActives(): Promise<RecurrencePlanifiable[]> {
    return this.actives;
  }

  async avancerAncre(id: string, derniereGeneration: Date): Promise<void> {
    this.ancres.push({ id, derniereGeneration });
  }
}
