"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { PhotoUpload } from "@/components/ui/PhotoUpload";
import { getNextStatuses } from "@/lib/status-transitions";
import { canWrite } from "@/shared/acces/permissions";
import { homePathFor } from "@/shared/acces/acces-pages";
import { formatApiError } from "@/lib/api-error";
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";

interface OperationPhoto {
  url: string;
  nom: string;
  uploadedAt?: string;
}

interface OperationDetail {
  _id: string;
  natureIntervention: string;
  dateHeurePrevue: string;
  dureeEstimeeMinutes: number;
  statut: OperationStatus;
  informationsParticulieres: string;
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
  photos: OperationPhoto[];
  rapportPdf?: string;
  clientId?: { nom: string; contact?: { email: string; telephone: string } };
  siteId?: { nom: string; adresse: string; typeDechets?: string[] };
  equipeId?: { nom: string; membres?: string[] };
  vehiculeId?: { identification: string; type: string };
  equipementIds?: { nom: string; type: string }[];
  historiqueStatuts?: {
    statut: OperationStatus;
    date: string;
    ancienStatut?: OperationStatus;
    parUtilisateur?: { nom: string };
  }[];
}

export function OperationDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canEdit = canWrite(role) || role === "chauffeur";

  const [op, setOp] = useState<OperationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Quantities form
  const [quantite, setQuantite] = useState<string>("");
  const [unite, setUnite] = useState<QuantiteUnite>("Litres");
  const [remarques, setRemarques] = useState<string>("");
  const [savingQuantity, setSavingQuantity] = useState(false);
  const [quantitySuccess, setQuantitySuccess] = useState(false);

  // Signature
  const [nomSignataire, setNomSignataire] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [savingSignature, setSavingSignature] = useState(false);
  const [signatureSuccess, setSignatureSuccess] = useState(false);

  // PDF
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/operations/${id}`);
    if (!res.ok) {
      router.push(homePathFor(role));
      return;
    }
    const data: OperationDetail = await res.json();
    setOp(data);
    setQuantite(data.quantiteCollectee !== undefined ? data.quantiteCollectee.toString() : "");
    setUnite(data.uniteQuantite || "Litres");
    setRemarques(data.remarquesTerrain || "");
    setNomSignataire(data.nomSignataireClient || "");
    setSignatureData(data.signatureClient || "");
    setLoading(false);
  }, [id, router, role]);

  useEffect(() => {
    load();
  }, [load]);

  /** Quantité à envoyer : uniquement un nombre strictement positif, sinon rien. */
  function quantiteToSend(): number | undefined {
    const value = parseFloat(quantite);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  /**
   * Message d'erreur quand l'utilisateur a saisi quelque chose que
   * `quantiteToSend()` écarte (0, négatif, non numérique). Un champ vide n'est
   * pas une erreur : le changement de statut se fait alors sans quantité.
   */
  function quantiteError(): string | null {
    if (quantite.trim() === "" || quantiteToSend() !== undefined) return null;
    const value = parseFloat(quantite);
    if (!Number.isFinite(value)) return "La quantité saisie n'est pas un nombre valide.";
    if (value === 0) return "Une quantité de 0 n'est pas une collecte valide.";
    return "La quantité ne peut pas être négative.";
  }

  async function changeStatus(statut: OperationStatus) {
    const invalid = quantiteError();
    if (invalid) {
      alert(invalid);
      return;
    }
    const res = await fetch(`/api/operations/${id}/statut`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statut,
        quantiteCollectee: quantiteToSend(),
        uniteQuantite: unite,
        remarquesTerrain: remarques,
      }),
    });
    if (res.ok) {
      load();
      return;
    }
    const data = await res.json().catch(() => ({}));
    alert(formatApiError(data.error, "Impossible de changer le statut."));
  }

  async function handleSaveQuantity(e: React.FormEvent) {
    e.preventDefault();
    const invalid = quantiteError();
    if (invalid) {
      alert(invalid);
      return;
    }
    setSavingQuantity(true);
    setQuantitySuccess(false);

    const res = await fetch(`/api/operations/${id}/statut`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statut: op?.statut,
        quantiteCollectee: quantiteToSend(),
        uniteQuantite: unite,
        remarquesTerrain: remarques,
      }),
    });

    setSavingQuantity(false);
    if (res.ok) {
      setQuantitySuccess(true);
      load();
      setTimeout(() => setQuantitySuccess(false), 3000);
      return;
    }
    const data = await res.json().catch(() => ({}));
    alert(formatApiError(data.error, "Impossible d'enregistrer la quantité."));
  }

  async function handleSaveSignature() {
    if (!signatureData) return;
    setSavingSignature(true);

    const res = await fetch(`/api/operations/${id}/statut`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statut: op?.statut,
        nomSignataireClient: nomSignataire,
        signatureClient: signatureData,
      }),
    });

    setSavingSignature(false);
    if (res.ok) {
      setSignatureSuccess(true);
      load();
      setTimeout(() => setSignatureSuccess(false), 3000);
    }
  }

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    try {
      const res = await fetch(`/api/operations/${id}/rapport`);
      if (!res.ok) {
        alert("Erreur lors de la génération du rapport PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport-${String(op?._id).slice(-8).toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      load();
    } catch {
      alert("Erreur lors de la génération du rapport PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  if (loading || !op) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center font-body-md text-body-md text-on-surface-variant">
        Chargement...
      </div>
    );
  }

  const nextStatuses = getNextStatuses(op.statut);
  const hasSignature = Boolean(op.signatureClient);

  return (
    <div className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <div>
        <nav className="mb-2 flex items-center gap-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
          <Link href="/operations" className="hover:text-primary">Opérations</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="font-bold text-on-surface">#{op._id.slice(-6).toUpperCase()}</span>
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
              {op.natureIntervention}
            </h1>
            <StatusBadge status={op.statut} />
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
              className="flex items-center gap-2 self-start rounded-full border border-outline-variant bg-surface-container-lowest px-5 py-2.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-high disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              {generatingPdf ? "Génération..." : "Générer le rapport PDF"}
            </button>
          )}
        </div>
      </div>

      {/* Status History */}
      <section className="rounded-2xl bg-surface-container-lowest p-gutter-md shadow-sm border">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">linear_scale</span>
            <span className="font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface">
              Avancement & Historique des Statuts
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(op.historiqueStatuts ?? []).map((h, i) => (
            <div key={i} className="flex items-start gap-3 md:flex-col md:items-center md:text-center p-2 rounded-xl bg-surface-container-low/40">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-completed text-on-primary">
                <span className="material-symbols-outlined text-[18px]">check</span>
              </div>
              <div>
                <span className="font-label-md text-label-md font-bold text-on-surface">{h.statut}</span>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {new Date(h.date).toLocaleString("fr-FR")}
                </p>
              </div>
            </div>
          ))}
        </div>
        {canEdit && nextStatuses.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3 border-t border-outline-variant/30 pt-4 items-center">
            <span className="font-label-md text-label-md font-bold text-on-surface">Changer le statut :</span>
            {nextStatuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeStatus(s)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-label-md text-label-md text-on-primary shadow-sm hover:bg-primary-container"
              >
                <span>Passer en &quot;{s}&quot;</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Quantities */}
      <section className="rounded-2xl bg-surface-container-lowest p-gutter-md shadow-sm border space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">oil_barrel</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Relevé des Quantités & Déchets Collectés</h2>
          </div>
          {op.quantiteCollectee !== undefined && op.quantiteCollectee > 0 && (
            <span className="rounded-full bg-status-completed/10 px-3 py-1 font-headline-sm text-headline-sm font-bold text-status-completed">
              {op.quantiteCollectee.toLocaleString("fr-FR")} {op.uniteQuantite || "Litres"}
            </span>
          )}
        </div>

        {quantitySuccess && (
          <div className="rounded-xl bg-status-completed/10 p-3 font-body-md text-body-md text-status-completed">
            Relevé de quantité enregistré avec succès.
          </div>
        )}

        <form onSubmit={handleSaveQuantity} className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Quantité mesurée / collectée *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              placeholder="Ex: 2500"
              disabled={!canEdit}
              className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-headline-sm text-headline-sm font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Unité de mesure *</label>
            <select
              value={unite}
              onChange={(e) => setUnite(e.target.value as QuantiteUnite)}
              disabled={!canEdit}
              className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            >
              <option value="Litres">Litres (L)</option>
              <option value="Kg">Kilogrammes (Kg)</option>
              <option value="M3">Mètres cubes (m³)</option>
              <option value="Bacs">Bacs / Fûts</option>
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Observations & Remarques terrain</label>
            <input
              type="text"
              value={remarques}
              onChange={(e) => setRemarques(e.target.value)}
              placeholder="Ex: Cuve propre, mesure par jauge"
              disabled={!canEdit}
              className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
          </div>

          {canEdit && (
            <div className="md:col-span-12 flex justify-end">
              <button
                type="submit"
                disabled={savingQuantity}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                {savingQuantity ? "Enregistrement..." : "Enregistrer la quantité"}
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Photos */}
      <section className="rounded-2xl bg-surface-container-lowest p-gutter-md shadow-sm border space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <span className="material-symbols-outlined text-primary text-[22px]">photo_library</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Photos de l&apos;intervention</h2>
          {op.photos && op.photos.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-primary">
              {op.photos.length}
            </span>
          )}
        </div>
        <PhotoUpload
          operationId={id}
          existingPhotos={op.photos || []}
          disabled={!canEdit}
          onPhotosChange={() => load()}
        />
      </section>

      {/* Signature */}
      <section className="rounded-2xl bg-surface-container-lowest p-gutter-md shadow-sm border space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <span className="material-symbols-outlined text-primary text-[22px]">draw</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Signature du client</h2>
          {hasSignature && (
            <span className="flex items-center gap-1 rounded-full bg-status-completed/10 px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-status-completed">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              Signé
            </span>
          )}
        </div>

        {signatureSuccess && (
          <div className="rounded-xl bg-status-completed/10 p-3 font-body-md text-body-md text-status-completed">
            Signature enregistrée avec succès.
          </div>
        )}

        {hasSignature && !canEdit ? (
          <div className="space-y-3">
            <p className="font-body-md text-body-md text-on-surface-variant">
              Signataire : <strong>{op.nomSignataireClient || "Client"}</strong>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={op.signatureClient}
              alt="Signature du client"
              className="rounded-xl border border-outline-variant/30 bg-white p-2"
              style={{ maxHeight: "120px" }}
            />
          </div>
        ) : canEdit ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Nom du signataire</label>
              <input
                type="text"
                value={nomSignataire}
                onChange={(e) => setNomSignataire(e.target.value)}
                placeholder="Nom et prénom du représentant client"
                className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                {hasSignature ? "Modifier la signature" : "Signature du représentant client"}
              </label>
              <SignaturePad
                onSignature={setSignatureData}
                width={400}
                height={180}
                existingSignature={op.signatureClient || undefined}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveSignature}
                disabled={!signatureData || savingSignature}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                {savingSignature ? "Enregistrement..." : "Enregistrer la signature"}
              </button>
            </div>
          </div>
        ) : (
          <p className="font-body-md text-body-md text-on-surface-variant italic">
            Aucune signature enregistrée. La signature sera disponible une fois l&apos;intervention terminée.
          </p>
        )}
      </section>

      {/* Client & Resources */}
      <div className="grid grid-cols-1 gap-gutter-md lg:grid-cols-2">
        <section className="rounded-2xl bg-surface-container-lowest p-gutter-md shadow-sm border">
          <h2 className="mb-4 font-headline-sm text-headline-sm text-on-surface">Client & Site d&apos;intervention</h2>
          <dl className="space-y-3 font-body-md text-body-md">
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Client</dt><dd className="font-bold text-on-surface">{op.clientId?.nom}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Site</dt><dd className="font-medium text-on-surface">{op.siteId?.nom} — {op.siteId?.adresse}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Types de déchets admis</dt><dd>{op.siteId?.typeDechets?.join(", ") || "Huiles usagées"}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Date & Heure prévues</dt><dd>{new Date(op.dateHeurePrevue).toLocaleString("fr-FR")}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Durée estimée</dt><dd>{op.dureeEstimeeMinutes} minutes</dd></div>
          </dl>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-gutter-md shadow-sm border">
          <h2 className="mb-4 font-headline-sm text-headline-sm text-on-surface">Ressources affectées</h2>
          <dl className="space-y-3 font-body-md text-body-md">
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Équipe d&apos;intervention</dt><dd className="font-bold text-on-surface">{op.equipeId?.nom ?? "Non affectée"}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Véhicule affecté</dt><dd className="font-medium text-on-surface">{op.vehiculeId?.identification ?? "Non affecté"}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Équipements réservés</dt><dd>{op.equipementIds?.map((e) => e.nom).join(", ") || "Aucun équipement spécifique"}</dd></div>
            {op.informationsParticulieres && (
              <div><dt className="font-label-md text-label-md text-on-surface-variant">Consignes particulières</dt><dd className="rounded-xl bg-surface-container-low p-3">{op.informationsParticulieres}</dd></div>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}
