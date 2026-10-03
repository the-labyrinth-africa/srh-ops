import { SystemClock } from "@/backend/platform/horloge/horloge";
import { creerCasDUsageOperations } from "./application/cas-d-usage";
import { creerVerificationConflits } from "./application/verifier-conflits";
import { AffectationsMongoose } from "./infrastructure/mongoose/affectations.mongoose";
import { OperationRepositoryMongoose } from "./infrastructure/mongoose/operation.repository.mongoose";

export const checkAssignmentConflicts = creerVerificationConflits({
  affectations: new AffectationsMongoose(),
});

export const casDUsageOperations = creerCasDUsageOperations({
  operations: new OperationRepositoryMongoose(),
  verifierConflits: checkAssignmentConflicts,
  horloge: new SystemClock(),
});
