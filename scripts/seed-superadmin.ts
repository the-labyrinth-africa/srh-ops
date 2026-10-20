import bcrypt from "bcryptjs";
import { loadEnvConfig } from "@next/env";
import { connectDB } from "../src/backend/platform/base-de-donnees/connexion";
import { User } from "../src/backend/comptes/infrastructure/mongoose/utilisateur.model";

export function shouldSeedSuperadminOnBuild(
  env: Record<string, string | undefined>,
  args: string[]
): boolean {
  if (!args.includes("--on-build")) return true;
  if (env.VERCEL_ENV === "preview") return false;
  return env.VERCEL_ENV === "production" || env.PLATFORM_SEED_ON_BUILD === "true";
}

export async function seedSuperadmin(env: NodeJS.ProcessEnv = process.env) {
  loadEnvConfig(process.cwd());
  await connectDB();
  try {
    await User.collection.createIndex(
      { platformSuperadmin: 1 },
      {
        unique: true,
        partialFilterExpression: { platformSuperadmin: true },
        name: "unique_platform_superadmin",
      }
    );
    await User.collection.createIndex(
      { premierAdminEntreprise: 1 },
      {
        unique: true,
        partialFilterExpression: { premierAdminEntreprise: true },
        name: "unique_premier_admin_entreprise",
      }
    );
    if (await User.exists({ role: "superadmin" })) {
      console.log("Un super administrateur existe déjà. Aucun compte n'a été modifié.");
      return;
    }

    const username = env.PLATFORM_SUPERADMIN_USERNAME?.trim().toLowerCase();
    const name = env.PLATFORM_SUPERADMIN_NAME?.trim();
    const email = env.PLATFORM_SUPERADMIN_EMAIL?.trim().toLowerCase();
    const password = env.PLATFORM_SUPERADMIN_PASSWORD;
    if (!username || !name || !email || !password) {
      throw new Error(
        "Définissez PLATFORM_SUPERADMIN_USERNAME, PLATFORM_SUPERADMIN_NAME, PLATFORM_SUPERADMIN_EMAIL et PLATFORM_SUPERADMIN_PASSWORD."
      );
    }
    if (!/^[a-z0-9_.-]{3,32}$/.test(username) || password.length < 12) {
      throw new Error("L'identifiant doit faire 3 à 32 caractères et le mot de passe au moins 12 caractères.");
    }
    if (await User.exists({ $or: [{ email }, { username }] })) {
      throw new Error("L'identifiant ou l'adresse e-mail est déjà utilisé par un compte existant.");
    }

    try {
      await User.create({
        username,
        nom: name,
        email,
        motDePasseHash: await bcrypt.hash(password, 12),
        role: "superadmin",
        mustChangePassword: true,
        platformSuperadmin: true,
      });
    } catch (error) {
      const duplicateKey =
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000;
      if (duplicateKey && (await User.exists({ role: "superadmin" }))) {
        console.log("Un super administrateur existe déjà. Aucun compte n'a été modifié.");
        return;
      }
      throw error;
    }
    console.log("Compte super administrateur créé. Changez son mot de passe à la première connexion.");
  } finally {
    await User.db.close();
  }
}

if (require.main === module) {
  loadEnvConfig(process.cwd());
  if (shouldSeedSuperadminOnBuild(process.env, process.argv.slice(2))) {
    seedSuperadmin().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Échec du seed super administrateur.");
      process.exitCode = 1;
    });
  } else {
    console.log("Seed super administrateur ignoré hors déploiement de production.");
  }
}
