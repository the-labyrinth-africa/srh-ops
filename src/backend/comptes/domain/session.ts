/**
 * Vrai si la session reste valide : soit le mot de passe n'a jamais été
 * changé depuis, soit ce changement est antérieur ou simultané à l'émission
 * du jeton. Un jeton sans `issuedAtMs` est traité comme antérieur à toute
 * réinitialisation (valeur 0), donc invalidé par tout `passwordChangedAtMs`.
 */
export function sessionEstValide(options: { issuedAtMs?: number; passwordChangedAtMs?: number }): boolean {
  if (options.passwordChangedAtMs === undefined) return true;
  return (options.issuedAtMs ?? 0) >= options.passwordChangedAtMs;
}
