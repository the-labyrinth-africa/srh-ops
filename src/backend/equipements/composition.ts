import { creerCasDUsageEquipements } from "./application/cas-d-usage";
import { EquipementRepositoryMongoose } from "./infrastructure/mongoose/equipement.repository.mongoose";

export const casDUsageEquipements = creerCasDUsageEquipements({ equipements: new EquipementRepositoryMongoose() });

export const listerEquipements = () => casDUsageEquipements.lister();
