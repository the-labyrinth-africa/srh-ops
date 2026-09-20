export function validateNewPassword(newPassword: string, confirmation: string): string | null {
  if (newPassword.length < 6) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (newPassword !== confirmation) return "Les deux mots de passe ne correspondent pas.";
  return null;
}
