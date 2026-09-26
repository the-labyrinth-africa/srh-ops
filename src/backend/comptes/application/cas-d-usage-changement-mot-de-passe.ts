import { UtilisateurIntrouvable, MotDePasseActuelIncorrect, NouveauMotDePasseIdentique } from "../domain/erreurs";
import type { UtilisateurRepository, JetonRepository, HacheurMotDePasse } from "../domain/ports";

export interface DependancesChangementMotDePasse {
  utilisateurs: UtilisateurRepository;
  jetons: JetonRepository;
  hacheur: HacheurMotDePasse;
}

export function creerCasDUsageChangementMotDePasse({
  utilisateurs,
  jetons,
  hacheur,
}: DependancesChangementMotDePasse) {
  return {
    /**
     * Changement volontaire (utilisateur déjà authentifié) : refuse `currentPassword ===
     * newPassword` ; révoque les jetons en attente après succès. **Ne pose jamais
     * `passwordChangedAt`** — un changement volontaire ne doit pas invalider la session en
     * cours (l'utilisateur vient de s'authentifier avec son mot de passe actuel), contrairement
     * à une réinitialisation. Point de vigilance explicite : ne pas « corriger » ce comportement.
     */
    async changer(utilisateurId: string, motDePasseActuel: string, nouveauMotDePasse: string): Promise<void> {
      const hash = await utilisateurs.trouverHashMotDePasse(utilisateurId);
      if (!hash) throw new UtilisateurIntrouvable();

      const valide = await hacheur.comparer(motDePasseActuel, hash);
      if (!valide) throw new MotDePasseActuelIncorrect();

      if (motDePasseActuel === nouveauMotDePasse) throw new NouveauMotDePasseIdentique();

      const nouveauHash = await hacheur.hacher(nouveauMotDePasse);
      await utilisateurs.changerMotDePasse(utilisateurId, nouveauHash, {
        mustChangePassword: false,
        poserPasswordChangedAt: false,
      });

      // Un mot de passe choisi révoque les liens en attente (invitation de repli comprise) : un
      // jeton de 72 h orphelin ne doit pas survivre au changement fait par l'utilisateur lui-même.
      await jetons.revoquerEnAttente(utilisateurId);
    },
  };
}

export type CasDUsageChangementMotDePasse = ReturnType<typeof creerCasDUsageChangementMotDePasse>;
