import crypto from "crypto";
import type { GenerateurDeSecrets } from "../domain/ports";

export class GenerateurDeSecretsAleatoire implements GenerateurDeSecrets {
  motDePasseAleatoire(longueur = 10): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!";
    let password = "";
    for (let i = 0; i < longueur; i++) password += chars.charAt(crypto.randomInt(0, chars.length));
    return password;
  }
}
