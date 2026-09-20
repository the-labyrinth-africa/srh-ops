import { creerCasDUsageVehicules } from "./application/cas-d-usage";
import { VehiculeRepositoryMongoose } from "./infrastructure/mongoose/vehicule.repository.mongoose";

export const casDUsageVehicules = creerCasDUsageVehicules({ vehicules: new VehiculeRepositoryMongoose() });
