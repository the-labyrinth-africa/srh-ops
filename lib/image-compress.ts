/**
 * Compression d'image côté navigateur.
 *
 * Les photos sont stockées en base64 dans le document `Operation` et l'API
 * plafonne chaque photo à 2 Mo (et 8 Mo cumulés par opération). Une photo prise
 * au téléphone pèse facilement 3 à 5 Mo : sans redimensionnement, le terrain se
 * heurterait systématiquement à un 413. On réduit donc à 1280 px de côté
 * maximum, en JPEG qualité 0,7, en baissant la qualité tant que la charge utile
 * dépasse le plafond.
 */

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1280;
const QUALITY_STEPS = [0.7, 0.55, 0.4, 0.3];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = dataUrl;
  });
}

/** Taille réellement stockée (la data URL complète) en octets. */
export function dataUrlBytes(dataUrl: string): number {
  if (typeof Blob !== "undefined") return new Blob([dataUrl]).size;
  return dataUrl.length;
}

/**
 * Renvoie une data URL JPEG redimensionnée sous le plafond, ou `null` si la
 * photo reste trop lourde même après compression.
 */
export async function compressImageFile(file: File): Promise<string | null> {
  const original = await readAsDataUrl(file);

  if (typeof document === "undefined") {
    return dataUrlBytes(original) <= MAX_PHOTO_BYTES ? original : null;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(original);
  } catch {
    return dataUrlBytes(original) <= MAX_PHOTO_BYTES ? original : null;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height) || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return dataUrlBytes(original) <= MAX_PHOTO_BYTES ? original : null;
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const quality of QUALITY_STEPS) {
    const candidate = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(candidate) <= MAX_PHOTO_BYTES) return candidate;
  }

  return null;
}
