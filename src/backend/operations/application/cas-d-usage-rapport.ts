import type { Acteur } from "@/shared/acces/acteur";
import type { Operation } from "../domain/operation";
import type { GenerateurRapportPdf, Horloge } from "../domain/ports";
import { nomFichierRapport } from "../domain/rapport";

export interface DependancesRapport {
  /** Lecture détaillée soumise au périmètre de l'acteur (celle du cas d'usage `obtenir`). */
  obtenir: (acteur: Acteur, id: string) => Promise<Operation>;
  generateur: GenerateurRapportPdf;
  horloge: Horloge;
}

export interface RapportGenere {
  contenu: Uint8Array;
  nomFichier: string;
}

export function creerCasDUsageRapport({ obtenir, generateur, horloge }: DependancesRapport) {
  return {
    /** Le rapport est régénéré à chaque demande ; il n'est jamais stocké dans l'opération. */
    async generer(acteur: Acteur, id: string): Promise<RapportGenere> {
      const operation = await obtenir(acteur, id);
      return {
        contenu: await generateur.generer(operation, horloge.maintenant()),
        nomFichier: nomFichierRapport(operation.id),
      };
    },
  };
}

export type CasDUsageRapport = ReturnType<typeof creerCasDUsageRapport>;
