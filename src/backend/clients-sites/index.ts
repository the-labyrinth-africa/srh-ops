// API publique du domaine `clients-sites` pour les autres domaines.
export {
  existeClient,
  identifiantDuClient,
  trouverSiteDuClientParNom,
  creerSite,
  siteAppartientAuClient,
  listerSitesDuClient,
} from "./composition";
