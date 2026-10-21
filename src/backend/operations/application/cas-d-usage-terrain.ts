// src/backend/operations/application/cas-d-usage-terrain.ts
import type { Acteur } from "@/shared/acces/acteur";
import { canTransition } from "@/shared/operations/transitions";
import {
  messageAlerteCoherence,
  terminaisonSansEnCours,
  type DemandeChangementStatut,
  type EtatTerrain,
} from "../domain/changement-statut";
import {
  ChauffeurSansEquipe,
  OperationHorsEquipe,
  OperationIntrouvable,
  TransitionInterdite,
  UrlPhotoRequise,
} from "../domain/erreurs";
import type { Operation, PhotoOperation } from "../domain/operation";
import { validerNouvellePhoto, verifierCapacite } from "../domain/photos";
import type { AlerteCoherence, Horloge, OperationRepository } from "../domain/ports";
import { chauffeurSansEquipe, peutAgirSurOperation } from "../domain/visibilite";

export interface DependancesTerrain {
  operations: OperationRepository;
  horloge: Horloge;
  alerteCoherence: AlerteCoherence;
  obtenirUniteQuantiteGlobale?: () => Promise<import("@/shared/operations/quantites").QuantiteUnite | null>;
}

export function creerCasDUsageTerrain({
  operations,
  horloge,
  alerteCoherence,
  obtenirUniteQuantiteGlobale,
}: DependancesTerrain) {
  function verifierAccesTerrain(acteur: Acteur): void {
    if (chauffeurSansEquipe(acteur)) throw new ChauffeurSansEquipe();
  }

  /** L'opération existe et l'acteur peut y écrire (un chauffeur n'agit que sur les opérations de son équipe). */
  async function etatAccessible(acteur: Acteur, id: string): Promise<EtatTerrain> {
    const etat = await operations.trouverEtatTerrain(id);
    if (!etat) throw new OperationIntrouvable();
    if (!peutAgirSurOperation(acteur, { equipeId: etat.equipeId })) throw new OperationHorsEquipe();
    return etat;
  }

  return {
    verifierAccesTerrain,

    async changerStatut(acteur: Acteur, id: string, demande: DemandeChangementStatut): Promise<Operation> {
      verifierAccesTerrain(acteur);
      const etat = await etatAccessible(acteur, id);

      if (!canTransition(etat.statut, demande.statut)) throw new TransitionInterdite(etat.statut, demande.statut);
      if (terminaisonSansEnCours(etat.statut, demande.statut)) {
        alerteCoherence(messageAlerteCoherence(id, etat.statut));
      }

      const demandeEffective = { ...demande };
      if (
        demandeEffective.quantiteCollectee !== undefined &&
        demandeEffective.quantiteCollectee !== etat.quantiteCollectee
      ) {
        demandeEffective.uniteQuantite = (await obtenirUniteQuantiteGlobale?.()) ?? demandeEffective.uniteQuantite;
      } else if (demandeEffective.quantiteCollectee !== undefined && etat.uniteQuantite) {
        demandeEffective.uniteQuantite = etat.uniteQuantite;
      }

      const operation = await operations.changerStatut(id, {
        ...demandeEffective,
        ancienStatut: etat.statut,
        date: horloge.maintenant(),
        parUtilisateur: acteur.id,
      });
      if (!operation) throw new OperationIntrouvable();
      return operation;
    },

    async ajouterPhoto(acteur: Acteur, id: string, envoi: { photo?: unknown; nom?: unknown }): Promise<PhotoOperation> {
      verifierAccesTerrain(acteur);
      // Forme de la photo contrôlée avant toute lecture (ordre historique : 400/413 avant 404).
      const url = validerNouvellePhoto(envoi.photo);
      const etat = await etatAccessible(acteur, id);
      verifierCapacite(etat.photos, url);

      const maintenant = horloge.maintenant();
      const photo: PhotoOperation = {
        url,
        nom: String(envoi.nom || `photo-${maintenant.getTime()}.jpg`),
        uploadedAt: maintenant,
      };
      if (!(await operations.ajouterPhoto(id, photo))) throw new OperationIntrouvable();
      return photo;
    },

    async retirerPhoto(acteur: Acteur, id: string, url: string | null | undefined): Promise<void> {
      verifierAccesTerrain(acteur);
      if (!url) throw new UrlPhotoRequise();
      await etatAccessible(acteur, id);
      // La suppression ne porte que sur les photos rattachées à cette opération.
      if (!(await operations.retirerPhotos(id, url))) throw new OperationIntrouvable();
    },
  };
}

export type CasDUsageTerrain = ReturnType<typeof creerCasDUsageTerrain>;
