export interface IdentiteEntreprise {
  nomEntreprise: string;
  sigle: string;
  siteWeb: string;
  logoDataUrl: string | null;
}

export const IDENTITE_ENTREPRISE_PAR_DEFAUT: IdentiteEntreprise = {
  nomEntreprise: "WOM",
  sigle: "WOM",
  siteWeb: "",
  logoDataUrl: null,
};
