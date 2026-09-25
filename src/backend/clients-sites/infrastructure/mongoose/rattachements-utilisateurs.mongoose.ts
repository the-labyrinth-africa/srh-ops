import type { RattachementsUtilisateurs } from "../../domain/ports";
// Les données utilisateur vivent désormais dans le domaine `comptes` (R3b) : ce dépôt interroge
// sa capacité publique dédiée (pas le modèle Mongoose lui-même) — comme annoncé par ce commentaire
// avant la migration (cf. `@/backend/comptes/index`).
import { existeUtilisateurAvecClientId } from "@/backend/comptes/index";

export class RattachementsUtilisateursMongoose implements RattachementsUtilisateurs {
  async existePourClient(clientId: string): Promise<boolean> {
    return existeUtilisateurAvecClientId(clientId);
  }
}
