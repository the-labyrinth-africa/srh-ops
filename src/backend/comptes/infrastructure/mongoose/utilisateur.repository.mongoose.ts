import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { UserRole } from "@/shared/acces/roles";
import type { Utilisateur, UtilisateurSaisie } from "../../domain/utilisateur";
import type { UtilisateurRepository } from "../../domain/ports";
import { User as UserModel } from "./utilisateur.model";

interface DocumentUtilisateur {
  _id: unknown;
  username: string;
  nom: string;
  email: string;
  role: UserRole;
  // ObjectId brut (écriture), `{ _id, nom }` (lecture, après .populate), ou absent (utilisateur
  // non rattaché, ex. un `admin`) : voir `versClientOuEquipe`.
  clientId?: unknown;
  equipeId?: unknown;
  telephone?: string;
  mustChangePassword?: boolean;
  passwordChangedAt?: Date;
  motDePasseHash?: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

function estPeuple(x: unknown): x is { _id: unknown; nom: string } {
  return Boolean(x) && typeof x === "object" && "nom" in (x as object);
}

/**
 * Distinction à trois voies (contrairement à `Site.clientId`, `required: true` dans son schéma) :
 * `clientId`/`equipeId` sont chacun *optionnels* dans le schéma `Utilisateur` (la plupart des
 * comptes, ex. `admin`/`dispatcher`, n'en ont ni l'un ni l'autre).
 * - `undefined` : le champ n'a jamais été renseigné sur le document (`.lean()` omet un chemin
 *   ObjectId optionnel non défini) → l'entité mappée NE DOIT PAS porter la clé non plus.
 * - `null` : le champ était renseigné mais `.populate()` n'a pas pu résoudre la référence
 *   (client/équipe supprimé(e)) → l'entité porte le `null` JSON réel.
 * - peuplé : `{ id, nom }`.
 */
function versClientOuEquipe(valeur: unknown): { id: string; nom: string } | null | undefined {
  if (valeur === undefined) return undefined;
  if (estPeuple(valeur)) return { id: String(valeur._id), nom: valeur.nom };
  return null; // présent mais non résolu par .populate() : référence pendante
}

function versEntite(doc: DocumentUtilisateur): Utilisateur {
  const clientId = versClientOuEquipe(doc.clientId);
  const equipeId = versClientOuEquipe(doc.equipeId);
  return {
    id: String(doc._id),
    username: doc.username,
    nom: doc.nom,
    email: doc.email,
    role: doc.role,
    // Clé absente (pas juste valeur `undefined`) quand le champ n'a jamais été renseigné :
    // un simple `clientId: undefined` laisserait `"clientId" in entite` vrai.
    ...(clientId !== undefined ? { clientId } : {}),
    ...(equipeId !== undefined ? { equipeId } : {}),
    telephone: doc.telephone ?? "",
    mustChangePassword: doc.mustChangePassword ?? false,
    passwordChangedAt: doc.passwordChangedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    revision: doc.__v,
  };
}

export class UtilisateurRepositoryMongoose implements UtilisateurRepository {
  async lister(role?: UserRole): Promise<Utilisateur[]> {
    await connectDB();
    const filtre = role ? { role } : {};
    const docs = (await UserModel.find(filtre)
      .select("-motDePasseHash")
      .populate("clientId", "nom")
      .populate("equipeId", "nom")
      .sort({ createdAt: -1 })
      .lean()) as DocumentUtilisateur[];
    return docs.map(versEntite);
  }

  async trouverParId(id: string): Promise<Utilisateur | null> {
    await connectDB();
    const doc = (await UserModel.findById(id)
      .select("-motDePasseHash")
      .populate("clientId", "nom")
      .populate("equipeId", "nom")
      .lean()) as DocumentUtilisateur | null;
    return doc ? versEntite(doc) : null;
  }

  async trouverProjectionParIdentifiant(identifiant: string): Promise<{ id: string; nom: string; email: string } | null> {
    await connectDB();
    const normalise = identifiant.trim().toLowerCase();
    const filtre = normalise.includes("@") ? { email: normalise } : { username: normalise };
    const doc = (await UserModel.findOne(filtre).select("nom email").lean()) as
      | { _id: unknown; nom: string; email: string }
      | null;
    return doc ? { id: String(doc._id), nom: doc.nom, email: doc.email } : null;
  }

  async existeEmailOuUsername(email: string, username: string): Promise<{ email: boolean; username: boolean }> {
    await connectDB();
    const emailNormalise = email.toLowerCase();
    const usernameNormalise = username.toLowerCase();
    const existant = (await UserModel.findOne({
      $or: [{ email: emailNormalise }, { username: usernameNormalise }],
    })
      .select("email username")
      .lean()) as { email: string; username: string } | null;
    if (!existant) return { email: false, username: false };
    return {
      email: existant.email.toLowerCase() === emailNormalise,
      username: existant.username.toLowerCase() === usernameNormalise,
    };
  }

  async creer(saisie: UtilisateurSaisie, motDePasseHash: string): Promise<Utilisateur> {
    await connectDB();
    const doc = await UserModel.create({
      username: saisie.username.toLowerCase(),
      nom: saisie.nom,
      email: saisie.email.toLowerCase(),
      motDePasseHash,
      role: saisie.role,
      telephone: saisie.telephone,
      clientId: saisie.clientId || undefined,
      equipeId: saisie.equipeId || undefined,
      // Un compte créé par un administrateur doit toujours choisir son propre mot de passe.
      mustChangePassword: true,
    });
    const cree = (await UserModel.findById(doc._id)
      .select("-motDePasseHash")
      .populate("clientId", "nom")
      .populate("equipeId", "nom")
      .lean()) as DocumentUtilisateur | null;
    // Fenêtre de course extrêmement improbable (suppression concurrente du compte entre sa création
    // et cette relecture) : replier sur le document tout juste créé (non peuplé) plutôt que de lever
    // un `TypeError` — le port `creer` doit toujours renvoyer un `Utilisateur`, jamais `null`.
    // `versEntite` ne lit que des champs nommés (jamais un spread) : `doc.toObject()` porte encore
    // `motDePasseHash`, mais il n'est jamais recopié dans l'entité renvoyée. Dans ce repli,
    // clientId/equipeId non résolus apparaîtraient en `null` plutôt qu'en `{ id, nom }` (document non
    // peuplé) : imprécision acceptée pour un chemin qui n'est atteignable qu'en cas de suppression
    // concurrente du compte qu'on vient de créer.
    return versEntite(cree ?? (doc.toObject() as DocumentUtilisateur));
  }

  async modifier(id: string, saisie: UtilisateurSaisie): Promise<Utilisateur | null> {
    await connectDB();
    // `username` n'est jamais modifiable après création (comme `PUT /api/users/[id]` aujourd'hui,
    // qui ne le lit même pas dans son corps de requête) : volontairement absent de `set`.
    const set: Record<string, unknown> = {
      nom: saisie.nom,
      email: saisie.email.toLowerCase(),
      role: saisie.role,
      telephone: saisie.telephone,
    };
    // Mongoose ignore les clés `undefined` : sans `$unset`, l'ancien rattachement resterait en base.
    const unset: Record<string, 1> = {};
    if (saisie.clientId) set.clientId = saisie.clientId;
    else unset.clientId = 1;
    if (saisie.equipeId) set.equipeId = saisie.equipeId;
    else unset.equipeId = 1;

    const doc = (await UserModel.findByIdAndUpdate(
      id,
      Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
      { new: true }
    )
      .select("-motDePasseHash")
      .populate("clientId", "nom")
      .populate("equipeId", "nom")
      .lean()) as DocumentUtilisateur | null;
    return doc ? versEntite(doc) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    await connectDB();
    return Boolean(await UserModel.findByIdAndDelete(id));
  }

  async changerMotDePasse(
    id: string,
    motDePasseHash: string,
    options: { mustChangePassword: boolean; poserPasswordChangedAt: boolean }
  ): Promise<{ id: string; nom: string; email: string } | null> {
    await connectDB();
    const set: Record<string, unknown> = { motDePasseHash, mustChangePassword: options.mustChangePassword };
    if (options.poserPasswordChangedAt) set.passwordChangedAt = new Date();

    const doc = (await UserModel.findByIdAndUpdate(id, { $set: set }, { new: true })
      .select("nom email")
      .lean()) as { _id: unknown; nom: string; email: string } | null;
    return doc ? { id: String(doc._id), nom: doc.nom, email: doc.email } : null;
  }

  async trouverHashMotDePasse(id: string): Promise<string | null> {
    await connectDB();
    const doc = (await UserModel.findById(id).select("motDePasseHash").lean()) as { motDePasseHash: string } | null;
    return doc ? doc.motDePasseHash : null;
  }
}
