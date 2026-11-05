import { NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { existeOperationCollectee, enregistrerOperationRealisee } from "@/backend/operations";
import { existeClient, siteAppartientAuClient } from "@/backend/clients-sites";
import { obtenirUniteQuantiteGlobale } from "@/backend/identite-entreprise";
import { QUANTITE_UNITES } from "@/shared/operations/quantites";
import { z } from "zod";
import { objectIdSchema } from "@/shared/validators/object-id";

const collecteSchema = z.object({
  clientId: objectIdSchema("Client requis", "Identifiant client invalide"),
  siteId: objectIdSchema("Site requis", "Identifiant site invalide"),
  natureIntervention: z.string().trim().min(1).max(200).default("Collecte d'huiles usagées"),
  quantiteCollectee: z.coerce.number().positive("La quantité doit être supérieure à zéro."),
  uniteQuantite: z.enum(QUANTITE_UNITES).default("Litres"),
  dateCollecte: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
  remarquesTerrain: z.string().trim().max(2000).optional().default(""),
});

export async function POST(request: Request) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Le contenu de la collecte doit être un JSON valide." }, { status: 400 });
  }
  const parsed = collecteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Vérifiez les informations de la collecte." }, { status: 400 });
  }
  const { clientId, siteId, natureIntervention, quantiteCollectee, uniteQuantite, dateCollecte, remarquesTerrain } = parsed.data;

  const [clientExiste, siteAssocie] = await Promise.all([
    existeClient(clientId),
    siteAppartientAuClient(siteId, clientId),
  ]);
  if (!clientExiste || !siteAssocie) return NextResponse.json({ error: "Le site ne correspond pas au client sélectionné." }, { status: 400 });
  const uniteQuantiteGlobale = await obtenirUniteQuantiteGlobale();
  if (uniteQuantiteGlobale && uniteQuantite !== uniteQuantiteGlobale) {
    return NextResponse.json({ error: `L'unité de collecte est imposée à « ${uniteQuantiteGlobale} » dans les paramètres de l'entreprise.` }, { status: 400 });
  }
  if (await existeOperationCollectee(siteId, dateCollecte, quantiteCollectee)) return NextResponse.json({ error: "Cette collecte existe déjà pour ce site, cette date et cette quantité." }, { status: 409 });

  await enregistrerOperationRealisee({
    clientId,
    siteId,
    natureIntervention,
    dateHeurePrevue: dateCollecte,
    dureeEstimeeMinutes: 120,
    informationsParticulieres: "Collecte saisie après réalisation",
    statut: "Rapportée",
    historiqueStatuts: [{ statut: "Rapportée", date: dateCollecte }],
    quantiteCollectee,
    uniteQuantite: uniteQuantiteGlobale ?? uniteQuantite,
    remarquesTerrain,
  });
  return NextResponse.json({ created: true }, { status: 201 });
}
