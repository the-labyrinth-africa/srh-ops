import { connectDB } from "@/backend/platform/base-de-donnees/connexion";
import type { RattachementsUtilisateurs } from "../../domain/ports";
// Transitoire : le modèle User rejoindra le domaine `comptes` au jalon R3 (l'import
// passera alors par `@/backend/comptes/index`).
import { User } from "@/models/User";

export class RattachementsUtilisateursMongoose implements RattachementsUtilisateurs {
  async existePourClient(clientId: string): Promise<boolean> {
    await connectDB();
    return Boolean(await User.exists({ clientId }));
  }
}
