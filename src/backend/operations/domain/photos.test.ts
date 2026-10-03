import { describe, it, expect } from "vitest";
import {
  FormatPhotoInvalide,
  PhotoRequise,
  PhotoTropLourde,
  PhotosTropLourdes,
  TropDePhotos,
} from "./erreurs";
import {
  MAX_PHOTO_OCTETS,
  MAX_PHOTOS,
  MAX_PHOTOS_OCTETS_CUMULES,
  octetsStockes,
  validerNouvellePhoto,
  verifierCapacite,
} from "./photos";

const PREFIXE = "data:image/jpeg;base64,";
const photoDe = (octets: number) => PREFIXE.padEnd(octets, "A");

describe("octetsStockes", () => {
  it("compte les octets de la chaîne stockée", () => {
    expect(octetsStockes("")).toBe(0);
    expect(octetsStockes(photoDe(1000))).toBe(1000);
  });

  it("compte en UTF-8 : un caractère accentué pèse deux octets", () => {
    expect(octetsStockes("é")).toBe(2);
  });
});

describe("validerNouvellePhoto", () => {
  it.each([undefined, null, "", 42, { url: "x" }])("valeur %j : PhotoRequise", (valeur) => {
    expect(() => validerNouvellePhoto(valeur)).toThrow(PhotoRequise);
  });

  it.each(["https://exemple.ci/photo.jpg", "data:text/plain;base64,AAAA"])("« %s » : FormatPhotoInvalide", (valeur) => {
    expect(() => validerNouvellePhoto(valeur)).toThrow(FormatPhotoInvalide);
  });

  it("2 Mo exactement : acceptée, l'URL est renvoyée telle quelle", () => {
    const photo = photoDe(MAX_PHOTO_OCTETS);
    expect(validerNouvellePhoto(photo)).toBe(photo);
  });

  it("un octet de plus que 2 Mo : PhotoTropLourde", () => {
    expect(() => validerNouvellePhoto(photoDe(MAX_PHOTO_OCTETS + 1))).toThrow(PhotoTropLourde);
  });

  it("messages exacts", () => {
    expect(() => validerNouvellePhoto(undefined)).toThrow("Photo requise (base64 data URL)");
    expect(() => validerNouvellePhoto("x")).toThrow("Format de photo invalide");
    expect(() => validerNouvellePhoto(photoDe(MAX_PHOTO_OCTETS + 1))).toThrow(
      "La photo dépasse 2 Mo. Réduisez sa taille avant l'envoi."
    );
  });
});

describe("verifierCapacite", () => {
  const existantes = (nombre: number, octets = 100) => Array.from({ length: nombre }, () => ({ url: photoDe(octets) }));

  it("neuf photos existantes : la dixième est acceptée", () => {
    expect(() => verifierCapacite(existantes(MAX_PHOTOS - 1), photoDe(100))).not.toThrow();
  });

  it("dix photos existantes : TropDePhotos « Maximum de 10 photos atteint »", () => {
    expect(() => verifierCapacite(existantes(MAX_PHOTOS), photoDe(100))).toThrow(TropDePhotos);
    expect(() => verifierCapacite(existantes(MAX_PHOTOS), photoDe(100))).toThrow("Maximum de 10 photos atteint");
  });

  it("le nombre est contrôlé avant le poids", () => {
    expect(() => verifierCapacite(existantes(MAX_PHOTOS, MAX_PHOTO_OCTETS), photoDe(MAX_PHOTO_OCTETS))).toThrow(
      TropDePhotos
    );
  });

  it("8 Mo cumulés exactement : acceptés ; un octet de plus : PhotosTropLourdes", () => {
    const trois = existantes(3, MAX_PHOTO_OCTETS);
    expect(() => verifierCapacite(trois, photoDe(MAX_PHOTOS_OCTETS_CUMULES - 3 * MAX_PHOTO_OCTETS))).not.toThrow();
    expect(() => verifierCapacite(trois, photoDe(MAX_PHOTOS_OCTETS_CUMULES - 3 * MAX_PHOTO_OCTETS + 1))).toThrow(
      PhotosTropLourdes
    );
    expect(() => verifierCapacite([...trois, { url: photoDe(MAX_PHOTO_OCTETS) }], photoDe(23))).toThrow(
      "Les photos de cette opération dépassent 8 Mo au total."
    );
  });

  it("une photo existante sans URL compte pour zéro octet", () => {
    expect(() => verifierCapacite([{}, { url: undefined }], photoDe(MAX_PHOTO_OCTETS))).not.toThrow();
  });
});
