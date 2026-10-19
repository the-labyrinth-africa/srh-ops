import { clientIp } from "@/backend/platform/http/adresse-client";
import { consumeRateLimit } from "@/backend/platform/limiteur-debit/rate-limit";
import { SystemClock } from "@/backend/platform/horloge/horloge";
import { siteAppartientAuClient } from "@/backend/clients-sites";
import { creerOperationDemande } from "@/backend/operations";
import { creerCasDUsageDemandes } from "./application/cas-d-usage";
import { DemandesPubliquesRepositoryMongoose } from "./infrastructure/mongoose/demande-publique.repository.mongoose";

export const adresseIpDemande = clientIp;

export const casDUsageDemandes = creerCasDUsageDemandes({
  demandes: new DemandesPubliquesRepositoryMongoose(),
  horloge: new SystemClock(),
  limiteur: consumeRateLimit,
  siteAppartientAuClient,
  operations: {
    creer: async (saisie, utilisateurId, sourceDemandeId) => {
      const operation = await creerOperationDemande(saisie, utilisateurId, sourceDemandeId);
      return { id: operation.id };
    },
  },
});
