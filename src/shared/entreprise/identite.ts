import type { QuantiteUnite } from "@/shared/operations/quantites";

export interface IdentiteEntreprise {
  nomEntreprise: string;
  sigle: string;
  siteWeb: string;
  logoDataUrl: string | null;
  /** Unité imposée pour les nouvelles saisies de collecte et de traçabilité, ou null si libre. */
  uniteQuantiteGlobale?: QuantiteUnite | null;
}

export const IDENTITE_ENTREPRISE_PAR_DEFAUT: IdentiteEntreprise = {
  nomEntreprise: "WOM",
  sigle: "WOM",
  siteWeb: "",
  logoDataUrl: null,
  uniteQuantiteGlobale: null,
};
