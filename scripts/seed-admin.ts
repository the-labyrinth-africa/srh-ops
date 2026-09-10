import bcrypt from "bcryptjs";
import { connectDB } from "../lib/db";
import { User } from "../models/User";
import { Client } from "../models/Client";
import { Site } from "../models/Site";
import { Equipe } from "../models/Equipe";
import { Vehicule } from "../models/Vehicule";
import { Equipement } from "../models/Equipement";
import { Operation } from "../models/Operation";

async function seed() {
  await connectDB();

  const hash = await bcrypt.hash("admin123", 10);
  await User.findOneAndUpdate(
    { email: "admin@srh.com" },
    {
      nom: "Jean Dupont",
      email: "admin@srh.com",
      motDePasseHash: hash,
      role: "admin",
    },
    { upsert: true, new: true }
  );

  await User.findOneAndUpdate(
    { email: "dispatcher@srh.com" },
    {
      nom: "Marie Martin",
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
      membres: ["Pierre Durand", "Luc Bernard"],
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
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
