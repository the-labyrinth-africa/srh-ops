import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import { User as UtilisateurModel } from "./infrastructure/mongoose/utilisateur.model";

// API publique du domaine `comptes` pour les autres domaines.
//
// Exception documentée (même nature que `enregistrement-modeles.ts`) : `RattachementsUtilisateursMongoose`
// de `clients-sites` et `equipes` vérifie qu'aucun utilisateur n'est rattaché à un client/une équipe
// avant suppression. Cette vérification interrogeait directement `User` quand le modèle vivait encore
// dans `src/models/` (dossier hérité, toléré en infrastructure) ; son commentaire d'origine anticipait
// déjà « l'import passera par `@/backend/comptes/index` » une fois le modèle rattaché à ce domaine.
// Seules ces deux capacités ciblées traversent la frontière — jamais le modèle Mongoose lui-même :
// exposer l'ODM donnerait à un autre domaine un pouvoir de requête arbitraire sur les données de
// `comptes`, ce que cette API publique doit précisément empêcher.

/** Vrai si au moins un compte utilisateur référence ce `clientId`. */
export async function existeUtilisateurAvecClientId(clientId: string): Promise<boolean> {
  await connectDB();
  return Boolean(await UtilisateurModel.exists({ clientId }));
}

/** Vrai si au moins un compte utilisateur référence cet `equipeId`. */
export async function existeUtilisateurAvecEquipeId(equipeId: string): Promise<boolean> {
  await connectDB();
  return Boolean(await UtilisateurModel.exists({ equipeId }));
}
