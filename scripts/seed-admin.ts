import bcrypt from "bcryptjs";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { connectDB } from "../lib/db";
import { User } from "../models/User";
import { Client } from "../models/Client";
import { Site } from "../models/Site";
import { Equipe } from "../models/Equipe";
import { Vehicule } from "../models/Vehicule";
import { Equipement } from "../models/Equipement";
import { Operation } from "../models/Operation";

async function seed() {
  process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/srh-ops";
  await connectDB();

  const backfillUsername = async () => {
    const missing = await User.find({
      $or: [{ username: { $exists: false } }, { username: null }, { username: "" }],
    });
    for (const u of missing) {
      const base = (u.email || "user")
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, "")
        .slice(0, 24);
      let candidate = base || "user";
      let suffix = 1;
      while (await User.exists({ username: candidate, _id: { $ne: u._id } })) {
        candidate = `${base}${suffix++}`;
      }
      await User.updateOne({ _id: u._id }, { $set: { username: candidate } });
    }
    if (missing.length > 0) {
      console.log(`Username rétabli pour ${missing.length} utilisateur(s)`);
    }
  };

  await backfillUsername();

  const [adminExists, dispatcherExists] = await Promise.all([
    User.exists({ email: "admin@srh.com" }),
    User.exists({ email: "dispatcher@srh.com" }),
  ]);

  if (adminExists && dispatcherExists) {
    console.log("Seed ignoré — les utilisateurs de base existent déjà");
    await User.db.close();
    return;
  }

  const hash = await bcrypt.hash("admin123", 10);
  await User.findOneAndUpdate(
    { email: "admin@srh.com" },
    {
      username: "admin",
      nom: "Modeste Kouassi",
      email: "admin@srh.com",
      motDePasseHash: hash,
      role: "admin",
    },
    { upsert: true, new: true }
  );

  await User.findOneAndUpdate(
    { email: "dispatcher@srh.com" },
    {
      username: "dispatcher",
      nom: "Jeanne Silué",
      email: "dispatcher@srh.com",
      motDePasseHash: await bcrypt.hash("dispatch123", 10),
      role: "dispatcher",
    },
    { upsert: true, new: true }
  );

  const clientCount = await Client.countDocuments();
  if (clientCount === 0) {
    const client = await Client.create({
      nom: "TotalEnergies Raffinerie Normandie",
      contact: { telephone: "02 35 00 00 00", email: "contact@total.fr" },
    });

    const site = await Site.create({
      clientId: client._id,
      nom: "Site Industriel Nord",
      adresse: "Zone Industrielle, 76100 Rouen",
      typeDechets: ["Huiles usagées", "DIB"],
      observations: "Accès camion citerne — badge requis",
    });

    const equipe = await Equipe.create({
      nom: "Équipe Alpha",
      membres: ["Pierre Koné", "Luc OFFO"],
      disponibilite: true,
    });

    const vehicule = await Vehicule.create({
      identification: "V-012",
      type: "Camion citerne",
      capacite: 15000,
      disponibilite: true,
    });

    const equipement = await Equipement.create({
      nom: "Pompe industrielle P-400",
      type: "Pompage",
      disponibilite: true,
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Pompage résidus noirs",
      dateHeurePrevue: tomorrow,
      dureeEstimeeMinutes: 180,
      equipeId: equipe._id,
      vehiculeId: vehicule._id,
      equipementIds: [equipement._id],
      informationsParticulieres: "Prévoir EPI niveau 2",
      statut: "Affectée",
      historiqueStatuts: [
        { statut: "Planifiée", date: new Date() },
        { statut: "Affectée", date: new Date() },
      ],
    });

    console.log("Données de démo créées");
  }

  console.log("Seed terminé — admin@srh.com / admin123");
  await User.db.close();
}

seed().catch((err) => {
  console.error(err);
  User.db.close().finally(() => process.exit(1));
});
