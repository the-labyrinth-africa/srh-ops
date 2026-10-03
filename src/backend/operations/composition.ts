import { creerVerificationConflits } from "./application/verifier-conflits";
import { AffectationsMongoose } from "./infrastructure/mongoose/affectations.mongoose";

export const checkAssignmentConflicts = creerVerificationConflits({
  affectations: new AffectationsMongoose(),
});
