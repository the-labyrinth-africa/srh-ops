import { creerSite, identifiantDuClient, trouverSiteDuClientParNom } from "@/backend/clients-sites/index";
import { enregistrerOperationRealisee, existeOperationCollectee } from "@/backend/operations/index";
import { creerCasDUsageImport } from "./application/cas-d-usage";
import { LecteurExcelJs } from "./infrastructure/excel/lecteur-excel.exceljs";

// Les sites et les opérations sont créés par leurs domaines, via leur API publique.
export const casDUsageImport = creerCasDUsageImport({
  lecteur: new LecteurExcelJs(),
  sites: {
    identifiantDuClient: (clientId) => identifiantDuClient(clientId),
    trouverParNom: (clientId, nom) => trouverSiteDuClientParNom(clientId, nom),
    creer: (site) => creerSite(site),
  },
  collectes: {
    existe: (siteId, dateHeurePrevue, quantiteCollectee) => existeOperationCollectee(siteId, dateHeurePrevue, quantiteCollectee),
    enregistrer: (collecte) => enregistrerOperationRealisee(collecte),
  },
});
