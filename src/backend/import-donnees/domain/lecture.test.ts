import { describe, it, expect } from "vitest";
import {
  ENTETES_DATE,
  ENTETES_QUANTITE,
  ENTETES_SITE,
  correspondAUnEntete,
  interpreterDate,
  interpreterQuantite,
} from "./lecture";

describe("interpreterDate", () => {
  it("format français : jour d'abord (05/06/2026 est le 5 juin)", () => {
    expect(interpreterDate("05/06/2026", 3)).toEqual({ date: new Date(2026, 5, 5) });
    expect(interpreterDate("23/06/2026", 3)).toEqual({ date: new Date(2026, 5, 23) });
  });

  it("séparateurs - et . ; année sur deux chiffres ; espaces autour", () => {
    expect(interpreterDate("05-06-2026", 3)).toEqual({ date: new Date(2026, 5, 5) });
    expect(interpreterDate(" 05.06.26 ", 3)).toEqual({ date: new Date(2026, 5, 5) });
  });

  it("format ISO aaaa-mm-jj : construit en heure locale", () => {
    expect(interpreterDate("2026-06-05", 3)).toEqual({ date: new Date(2026, 5, 5) });
  });

  it("date native et numéro de série Excel : repris tels quels", () => {
    const native = new Date(2026, 5, 11);
    expect(interpreterDate(native, 3)).toEqual({ date: native });
    expect(interpreterDate(46184, 3)).toEqual({ date: new Date(Math.round((46184 - 25569) * 86400 * 1000)) });
  });

  it("mois ou jour hors bornes au format français : erreur avec la ligne et la valeur", () => {
    expect(interpreterDate("05/13/2026", 7)).toEqual({ error: 'Date invalide à la ligne 7: "05/13/2026"' });
    expect(interpreterDate("32/01/2026", 7)).toEqual({ error: 'Date invalide à la ligne 7: "32/01/2026"' });
  });

  it("texte illisible : erreur ; valeur d'un autre type ou absente : « non reconnue »", () => {
    expect(interpreterDate("pas une date", 9)).toEqual({ error: 'Date invalide à la ligne 9: "pas une date"' });
    expect(interpreterDate(undefined, 9)).toEqual({ error: "Date non reconnue à la ligne 9" });
    expect(interpreterDate(null, 9)).toEqual({ error: "Date non reconnue à la ligne 9" });
    expect(interpreterDate({ formula: "A1" }, 9)).toEqual({ error: "Date non reconnue à la ligne 9" });
  });
});

describe("interpreterQuantite", () => {
  it("cellule vide : aucune quantité (pas un zéro)", () => {
    for (const vide of [undefined, null, ""]) expect(interpreterQuantite(vide, 4)).toEqual({});
  });

  it("nombre : repris tel quel, y compris zéro et négatif", () => {
    expect(interpreterQuantite(200, 4)).toEqual({ quantite: 200 });
    expect(interpreterQuantite(0, 4)).toEqual({ quantite: 0 });
    expect(interpreterQuantite(-5, 4)).toEqual({ quantite: -5 });
  });

  it("texte : virgule décimale et unité tolérées", () => {
    expect(interpreterQuantite("12,5", 4)).toEqual({ quantite: 12.5 });
    expect(interpreterQuantite("300 L", 4)).toEqual({ quantite: 300 });
  });

  it("texte sans nombre, ou valeur d'un autre type : erreur avec la ligne et la valeur", () => {
    expect(interpreterQuantite("beaucoup", 4)).toEqual({ error: 'Quantité invalide à la ligne 4: "beaucoup"' });
    expect(interpreterQuantite(true, 4)).toEqual({ error: 'Quantité invalide à la ligne 4: "true"' });
  });
});

describe("correspondAUnEntete", () => {
  it("reconnaît les en-têtes usuels, sans tenir compte de la casse ni des accents", () => {
    expect(correspondAUnEntete("SITES", ENTETES_SITE)).toBe(true);
    expect(correspondAUnEntete("Date prévue", ENTETES_DATE)).toBe(true);
    expect(correspondAUnEntete("Quantité collectée", ENTETES_QUANTITE)).toBe(true);
    expect(correspondAUnEntete("QTES", ENTETES_QUANTITE)).toBe(true);
  });

  it("valeur vide ou sans caractère utile : jamais reconnue", () => {
    expect(correspondAUnEntete("", ENTETES_SITE)).toBe(false);
    expect(correspondAUnEntete("  --  ", ENTETES_SITE)).toBe(false);
  });

  it("tolérance d'origine : un fragment contenu dans un libellé connu est reconnu", () => {
    expect(correspondAUnEntete("a", ENTETES_SITE)).toBe(true);
    expect(correspondAUnEntete("foo1", ENTETES_SITE)).toBe(false);
  });
});
