import type { RattachementsUtilisateurs } from "../../domain/ports";
// Les données utilisateur vivent désormais dans le domaine `comptes` (R3b) : ce dépôt interroge
// sa capacité publique dédiée (pas le modèle Mongoose lui-même) — comme annoncé par ce commentaire
// avant la migration (cf. `@/backend/comptes/index`).
import { existeUtilisateurAvecEquipeId } from "@/backend/comptes/index";

export class RattachementsUtilisateursMongoose implements RattachementsUtilisateurs {
  async existePourEquipe(equipeId: string): Promise<boolean> {
    return existeUtilisateurAvecEquipeId(equipeId);
  }
}
