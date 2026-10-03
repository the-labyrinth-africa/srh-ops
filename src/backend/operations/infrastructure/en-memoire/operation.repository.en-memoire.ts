// src/backend/operations/infrastructure/en-memoire/operation.repository.en-memoire.ts
import {
  idDeReference,
  type FiltreOperations,
  type Operation,
  type OperationSaisie,
  type Pagination,
  type PhotoOperation,
  type StatutInitial,
} from "../../domain/operation";
import type { ChangementStatut, EtatTerrain } from "../../domain/changement-statut";
import type { OperationRepository } from "../../domain/ports";

/** Dépôt en mémoire : sert aux tests des cas d'usage. Les relations y restent des identifiants bruts. */
export class OperationRepositoryEnMemoire implements OperationRepository {
  private readonly donnees = new Map<string, Operation>();
  private compteur = 0;
  /** Filtres reçus par `lister` et `listerPourPlanning`, dans l'ordre des appels. */
  readonly filtresRecus: FiltreOperations[] = [];

  /** Insère une opération telle quelle (pour préparer un état : relation peuplée, pendante…). */
  deposer(operation: Operation): void {
    this.donnees.set(operation.id, operation);
  }

  private filtrer(filtre: FiltreOperations): Operation[] {
    return [...this.donnees.values()].filter(
      (op) =>
        (!filtre.clientId || idDeReference(op.clientId) === filtre.clientId) &&
        (!filtre.siteId || idDeReference(op.siteId) === filtre.siteId) &&
        (!filtre.equipeId || idDeReference(op.equipeId) === filtre.equipeId) &&
        (!filtre.vehiculeId || idDeReference(op.vehiculeId) === filtre.vehiculeId) &&
        (!filtre.statut || op.statut === filtre.statut) &&
        (!filtre.dateDebut || op.dateHeurePrevue >= filtre.dateDebut) &&
        (!filtre.dateFin || op.dateHeurePrevue <= filtre.dateFin)
    );
  }

  async lister(filtre: FiltreOperations, { skip, limit }: Pagination): Promise<{ items: Operation[]; total: number }> {
    this.filtresRecus.push(filtre);
    const tries = this.filtrer(filtre).sort((a, b) => b.dateHeurePrevue.getTime() - a.dateHeurePrevue.getTime());
    return { items: tries.slice(skip, skip + limit), total: tries.length };
  }

  async listerPourPlanning(filtre: FiltreOperations): Promise<Operation[]> {
    this.filtresRecus.push(filtre);
    return this.filtrer(filtre);
  }

  async trouverDetailParId(id: string): Promise<Operation | null> {
    return this.donnees.get(id) ?? null;
  }

  async creer(saisie: OperationSaisie, initial: StatutInitial): Promise<Operation> {
    this.compteur += 1;
    const operation: Operation = {
      photos: [],
      rapportPdf: "",
      ...saisie,
      id: `operation-${this.compteur}`,
      statut: initial.statut,
      historiqueStatuts: [{ statut: initial.statut, date: initial.date, parUtilisateur: initial.parUtilisateur }],
      createdAt: initial.date,
      updatedAt: initial.date,
      revision: 0,
    };
    this.donnees.set(operation.id, operation);
    return operation;
  }

  async modifier(id: string, saisie: OperationSaisie): Promise<Operation | null> {
    const existante = this.donnees.get(id);
    if (!existante) return null;
    const modifiee: Operation = { ...existante, ...saisie };
    this.donnees.set(id, modifiee);
    return modifiee;
  }

  async supprimer(id: string): Promise<boolean> {
    return this.donnees.delete(id);
  }

  async trouverEtatTerrain(id: string): Promise<EtatTerrain | null> {
    const operation = this.donnees.get(id);
    if (!operation) return null;
    const etat: EtatTerrain = { statut: operation.statut, photos: operation.photos.map(({ url }) => ({ url })) };
    const equipeId = idDeReference(operation.equipeId);
    if (equipeId !== undefined) etat.equipeId = equipeId;
    return etat;
  }

  async changerStatut(id: string, changement: ChangementStatut): Promise<Operation | null> {
    const existante = this.donnees.get(id);
    if (!existante) return null;
    const modifiee: Operation = {
      ...existante,
      statut: changement.statut,
      historiqueStatuts: [
        ...existante.historiqueStatuts,
        {
          statut: changement.statut,
          date: changement.date,
          parUtilisateur: changement.parUtilisateur,
          ancienStatut: changement.ancienStatut,
        },
      ],
    };
    if (changement.quantiteCollectee !== undefined) modifiee.quantiteCollectee = changement.quantiteCollectee;
    if (changement.uniteQuantite) modifiee.uniteQuantite = changement.uniteQuantite;
    if (changement.remarquesTerrain !== undefined) modifiee.remarquesTerrain = changement.remarquesTerrain;
    if (changement.nomSignataireClient !== undefined) modifiee.nomSignataireClient = changement.nomSignataireClient;
    if (changement.signatureClient !== undefined) modifiee.signatureClient = changement.signatureClient;
    if (changement.photos !== undefined) {
      modifiee.photos = changement.photos.map((photo) => ({
        url: photo.url,
        nom: photo.nom ?? "",
        uploadedAt: changement.date,
      }));
    }
    this.donnees.set(id, modifiee);
    return modifiee;
  }

  async ajouterPhoto(id: string, photo: PhotoOperation): Promise<boolean> {
    const existante = this.donnees.get(id);
    if (!existante) return false;
    this.donnees.set(id, { ...existante, photos: [...existante.photos, photo] });
    return true;
  }

  async retirerPhotos(id: string, url: string): Promise<boolean> {
    const existante = this.donnees.get(id);
    if (!existante) return false;
    this.donnees.set(id, { ...existante, photos: existante.photos.filter((photo) => photo.url !== url) });
    return true;
  }
}
