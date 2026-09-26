import { UtilisateurIntrouvable, LimiteDeDebitAtteinte } from "../domain/erreurs";
import type { UtilisateurRepository, EnvoiEmail, LimiteurDebit, ResultatEnvoiEmail } from "../domain/ports";

const HEURE_MS = 3_600_000;

export interface DependancesEmailDeTest {
  utilisateurs: UtilisateurRepository;
  envoiEmail: EnvoiEmail;
  limiteurDebit: LimiteurDebit;
}

export function creerCasDUsageEmailDeTest({ utilisateurs, envoiEmail, limiteurDebit }: DependancesEmailDeTest) {
  return {
    /**
     * Envoie un e-mail de test à l'adresse du compte visé. Transposition fidèle de l'ancienne
     * route `POST /api/mail/test` : limiteur consulté AVANT toute autre action (une erreur du
     * limiteur, service indisponible, se propage telle quelle jusqu'au contrôleur — non capturée
     * ici, même discipline que `envoyerLienDeReinitialisation` ; une limite atteinte lève
     * `LimiteDeDebitAtteinte`, seule façon pour le contrôleur de distinguer les deux cas).
     */
    async envoyer(utilisateurId: string): Promise<ResultatEnvoiEmail> {
      const limite = await limiteurDebit("mail-test", utilisateurId, { limit: 5, windowMs: HEURE_MS });
      if (!limite.allowed) throw new LimiteDeDebitAtteinte(limite.retryAfterSeconds);

      const utilisateur = await utilisateurs.trouverParId(utilisateurId);
      if (!utilisateur) throw new UtilisateurIntrouvable();

      return envoiEmail({
        to: utilisateur.email,
        subject: "SRH Ops — e-mail de test",
        text: `Bonjour ${utilisateur.nom},\n\nCet e-mail confirme que l'envoi de messages depuis SRH Ops fonctionne.\n\nL'équipe SRH Ops`,
      });
    },
  };
}

export type CasDUsageEmailDeTest = ReturnType<typeof creerCasDUsageEmailDeTest>;
