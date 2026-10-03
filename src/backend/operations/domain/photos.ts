import { FormatPhotoInvalide, PhotoRequise, PhotoTropLourde, PhotosTropLourdes, TropDePhotos } from "./erreurs";

/**
 * Les photos sont stockées en base64 dans le document de l'opération (limite BSON de 16 Mo).
 * Plafonds volontairement bas pour garder de la marge : 2 Mo par photo et 8 Mo cumulés par
 * opération, mesurés sur la charge utile réellement stockée ; 10 photos au plus.
 */
export const MAX_PHOTO_OCTETS = 2 * 1024 * 1024;
export const MAX_PHOTOS_OCTETS_CUMULES = 8 * 1024 * 1024;
export const MAX_PHOTOS = 10;

export function octetsStockes(dataUrl: string): number {
  return Buffer.byteLength(dataUrl, "utf8");
}

/** Contrôles faits avant toute lecture de l'opération : présence, format, poids. Renvoie l'URL validée. */
export function validerNouvellePhoto(photo: unknown): string {
  if (!photo || typeof photo !== "string") throw new PhotoRequise();
  if (!photo.startsWith("data:image/")) throw new FormatPhotoInvalide();
  if (octetsStockes(photo) > MAX_PHOTO_OCTETS) throw new PhotoTropLourde();
  return photo;
}

/** Contrôles faits sur l'opération lue : d'abord le nombre, puis le poids cumulé. */
export function verifierCapacite(existantes: { url?: string }[], nouvelle: string): void {
  if (existantes.length >= MAX_PHOTOS) throw new TropDePhotos();
  const cumul = existantes.reduce((somme, photo) => somme + octetsStockes(photo.url ?? ""), 0);
  if (cumul + octetsStockes(nouvelle) > MAX_PHOTOS_OCTETS_CUMULES) throw new PhotosTropLourdes();
}
