import { describe, it, expect } from "vitest";
import {
  ChauffeurSansEquipe,
  CompteClientSansPerimetre,
  ConflitAffectation,
  FormatPhotoInvalide,
  OperationHorsEquipe,
  OperationIntrouvable,
  PhotoRequise,
  PhotoTropLourde,
  PhotosTropLourdes,
  TransitionInterdite,
  TropDePhotos,
  UrlPhotoRequise,
} from "../domain/erreurs";
import { versReponseErreur } from "./erreurs-http";

describe("versReponseErreur", () => {
  it.each([
    [new ChauffeurSansEquipe(), 403, "Compte chauffeur sans équipe attribuée"],
    [new CompteClientSansPerimetre(), 403, "Compte client sans périmètre attribué"],
    [new OperationHorsEquipe(), 403, "Opération non affectée à votre équipe"],
    [new OperationIntrouvable(), 404, "Non trouvé"],
    [new TransitionInterdite("Planifiée", "Terminée"), 400, "Transition Planifiée → Terminée non autorisée"],
    [new PhotoRequise(), 400, "Photo requise (base64 data URL)"],
    [new FormatPhotoInvalide(), 400, "Format de photo invalide"],
    [new TropDePhotos(), 400, "Maximum de 10 photos atteint"],
    [new UrlPhotoRequise(), 400, "URL de la photo requise"],
    [new PhotoTropLourde(), 413, "La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi."],
    [new PhotosTropLourdes(), 413, "Les photos de cette opération dépassent 8 Mo au total."],
  ] as const)("%o → %i", async (erreur, statut, message) => {
    const reponse = versReponseErreur(erreur);
    expect(reponse.status).toBe(statut);
    expect(await reponse.json()).toEqual({ error: message });
  });

  it("conflit d'affectation → 409 avec la liste des conflits", async () => {
    const conflits = [{ hasConflict: true, message: "L'équipe est déjà affectée à une opération sur ce créneau" }];
    const reponse = versReponseErreur(new ConflitAffectation(conflits));
    expect(reponse.status).toBe(409);
    expect(await reponse.json()).toEqual({ error: "Conflit d'affectation", conflicts: conflits });
  });

  it("toute autre erreur remonte telle quelle", () => {
    const inconnue = new Error("Cast to ObjectId failed");
    expect(() => versReponseErreur(inconnue)).toThrow(inconnue);
    expect(() => versReponseErreur("chaîne")).toThrow();
  });
});
