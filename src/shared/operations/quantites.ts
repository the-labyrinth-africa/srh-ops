export type QuantiteUnite = "Litres" | "Kg" | "M3" | "Bacs";

export const QUANTITE_UNITES = ["Litres", "Kg", "M3", "Bacs"] as const satisfies readonly QuantiteUnite[];
