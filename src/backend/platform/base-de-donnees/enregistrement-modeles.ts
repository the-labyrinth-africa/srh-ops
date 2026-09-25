// Enregistrement des modèles Mongoose : nécessaire pour que `populate` retrouve
// chaque collection. Unique module de `platform` autorisé à importer les modèles
// des domaines (voir la décision n°3 du plan R0). Chaque domaine migré remplace
// ici son ancienne ligne par l'import de son propre `infrastructure/mongoose/*.model`.
import "@/backend/clients-sites/infrastructure/mongoose/client.model";
import "@/backend/clients-sites/infrastructure/mongoose/site.model";
import "@/backend/equipes/infrastructure/mongoose/equipe.model";
import "@/backend/vehicules/infrastructure/mongoose/vehicule.model";
import "@/backend/equipements/infrastructure/mongoose/equipement.model";
import "@/backend/comptes/infrastructure/mongoose/utilisateur.model";
import "@/models/Operation";
import "@/models/Recurrence";
