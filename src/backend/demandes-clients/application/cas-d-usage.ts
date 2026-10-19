import type {
  CreationOperationDemande,
  DemandePubliqueSaisie,
  QualificationDemande,
} from "../domain/demande";
import {
  DemandeDejaTraitee,
  DemandePubliqueIntrouvable,
  LimiteDemandesAtteinte,
  SiteDemandeInvalide,
} from "../domain/erreurs";
import type {
  AppartenanceSiteClient,
  DemandesPubliquesRepository,
  HorlogeDemandes,
  LimiteurDemandes,
} from "../domain/ports";

const HEURE_MS = 60 * 60 * 1000;

export function creerCasDUsageDemandes({
  demandes,
  horloge,
  limiteur,
  siteAppartientAuClient,
  operations,
}: {
  demandes: DemandesPubliquesRepository;
  horloge: HorlogeDemandes;
  limiteur: LimiteurDemandes;
  siteAppartientAuClient: AppartenanceSiteClient;
  operations: CreationOperationDemande;
}) {
  return {
    async limiterIp(ip: string) {
      const limite = await limiteur("demande-publique-ip", ip, { limit: 5, windowMs: HEURE_MS });
      if (!limite.allowed) throw new LimiteDemandesAtteinte(limite.retryAfterSeconds);
    },

    async recevoir(saisie: DemandePubliqueSaisie) {
      const limiteEmail = await limiteur("demande-publique-email", saisie.email, {
        limit: 3,
        windowMs: HEURE_MS,
      });
      if (!limiteEmail.allowed) throw new LimiteDemandesAtteinte(limiteEmail.retryAfterSeconds);

      return demandes.creer(saisie, horloge.maintenant());
    },

    lister() {
      return demandes.lister();
    },

    async convertir(
      id: string,
      qualification: QualificationDemande,
      utilisateurId: string
    ) {
      if (!(await siteAppartientAuClient(qualification.siteId, qualification.clientId))) {
        throw new SiteDemandeInvalide();
      }

      const maintenant = horloge.maintenant();
      const demande = await demandes.acquerirConversion(id, maintenant);
      if (!demande) {
        if (!(await demandes.trouverParId(id))) throw new DemandePubliqueIntrouvable();
        throw new DemandeDejaTraitee();
      }

      try {
        const operation = await operations.creer(
          {
            clientId: qualification.clientId,
            siteId: qualification.siteId,
            natureIntervention: demande.natureIntervention,
            dateHeurePrevue: demande.dateSouhaitee,
            dureeEstimeeMinutes: 120,
            equipementIds: [],
            informationsParticulieres: demande.informationsParticulieres,
            uniteQuantite: "Litres",
            remarquesTerrain: "",
            nomSignataireClient: "",
            signatureClient: "",
          },
          utilisateurId,
          demande.id
        );

        const updated = await demandes.marquerConvertie(
          id,
          qualification,
          operation.id,
          utilisateurId,
          horloge.maintenant()
        );
        if (!updated) throw new DemandeDejaTraitee();
        return { ...demande, statut: "convertie" as const, operationId: operation.id };
      } catch (error) {
        await demandes.libererConversion(id);
        throw error;
      }
    },

    async refuser(id: string, utilisateurId: string, motif = "") {
      const refused = await demandes.refuser(id, utilisateurId, motif, horloge.maintenant());
      if (refused) return;
      if (!(await demandes.trouverParId(id))) throw new DemandePubliqueIntrouvable();
      throw new DemandeDejaTraitee();
    },
  };
}

export type CasDUsageDemandes = ReturnType<typeof creerCasDUsageDemandes>;
