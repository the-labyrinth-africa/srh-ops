import { SystemClock } from "@/backend/platform/horloge/horloge";
import {
  checkAssignmentConflicts,
  creerOperationPlanifiee,
  existeOperationSurCreneau,
} from "@/backend/operations/index";
import { creerCasDUsageRecurrences } from "./application/cas-d-usage";
import { creerGenerationOccurrences } from "./application/generer-occurrences";
import { RecurrenceRepositoryMongoose } from "./infrastructure/mongoose/recurrence.repository.mongoose";

const recurrences = new RecurrenceRepositoryMongoose();

export const casDUsageRecurrences = creerCasDUsageRecurrences({ recurrences });

export const genererOccurrences = creerGenerationOccurrences({
  recurrences,
  // Les opérations sont créées par le domaine `operations`, via son API publique.
  operations: {
    existeSurCreneau: (clientId, siteId, dateHeurePrevue) => existeOperationSurCreneau(clientId, siteId, dateHeurePrevue),
    verifierConflits: (demande) => checkAssignmentConflicts(demande),
    creer: (occurrence, parUtilisateur) => creerOperationPlanifiee(occurrence, parUtilisateur),
  },
  horloge: new SystemClock(),
});
