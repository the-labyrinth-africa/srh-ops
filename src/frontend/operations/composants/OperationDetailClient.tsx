"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge, SignaturePad, PhotoUpload, formatApiError } from "@/frontend/design-system";
import { getNextStatuses } from "@/shared/operations/transitions";
import { canWrite } from "@/shared/acces/permissions";
import { homePathFor } from "@/shared/acces/acces-pages";
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
  historiqueStatuts: { statut: string; date: string; parUtilisateur?: { nom: string } }[];
  clientId?: { _id: string; nom: string; contact?: { telephone?: string; email?: string } };
  siteId?: { _id: string; nom: string; adresse?: string; observations?: string };
  equipeId?: { _id: string; nom: string; membres?: string[] };
  vehiculeId?: { _id: string; identification: string; type?: string };
  equipementIds?: { _id: string; nom: string; type?: string }[];
}

export function OperationDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const canEdit = canWrite(userRole);

  const [operation, setOperation] = useState<OperationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState("");

  // Formulaire changement de statut & terrain
  const [nextStatut, setNextStatut] = useState<OperationStatus | "">("");
  const [quantite, setQuantite] = useState<string>("");
  const [unite, setUnite] = useState<QuantiteUnite>("Litres");
  const [remarques, setRemarques] = useState<string>("");
  const [nomSignataire, setNomSignataire] = useState<string>("");
  const [signatureData, setSignatureData] = useState<string>("");

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/operations/${id}`);
      if (res.status === 404) {
        setError("Opération introuvable ou accès non autorisé.");
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(formatApiError(data.error));
        return;
      }
      const data: OperationDetail = await res.json();
      setOperation(data);
      setQuantite(data.quantiteCollectee ? String(data.quantiteCollectee) : "");
      setUnite(data.uniteQuantite || "Litres");
      setRemarques(data.remarquesTerrain || "");
      setNomSignataire(data.nomSignataireClient || "");
      setSignatureData(data.signatureClient || "");
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleStatusChange = async (targetStatus: OperationStatus) => {
    setActionError("");
    setStatusLoading(true);

    try {
      const payload = {
        statut: targetStatus,
        quantiteCollectee: quantite ? Number(quantite) : undefined,
        uniteQuantite: quantite ? unite : undefined,
        remarquesTerrain: remarques || undefined,
        nomSignataireClient: nomSignataire || undefined,
        signatureClient: signatureData || undefined,
      };

      const res = await fetch(`/api/operations/${id}/statut`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setActionError(formatApiError(data.error));
        return;
      }

      setNextStatut("");
      await fetchDetail();
    } catch {
      setActionError("Erreur lors de la mise à jour du statut.");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Voulez-vous vraiment supprimer cette opération ?")) return;
    try {
      const res = await fetch(`/api/operations/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/operations");
      } else {
        const data = await res.json();
        setActionError(formatApiError(data.error));
      }
    } catch {
      setActionError("Erreur lors de la suppression.");
    }
  };

  const handleSendReportEmail = async () => {
    setActionError("");
    setEmailSuccess("");
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/operations/${id}/rapport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(formatApiError(data.error));
        return;
      }
      setEmailSuccess(`Rapport officiel envoyé par e-mail à ${data.destinataire}.`);
      await fetchDetail();
    } catch {
      setActionError("Erreur lors de l'envoi du rapport par e-mail.");
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return <div className="p-margin-desktop text-outline">Chargement du détail...</div>;
  }

  if (error || !operation) {
    return (
      <div className="p-margin-desktop space-y-4">
        <div className="rounded-xl bg-error-container p-4 text-on-error-container">
          {error || "Opération introuvable."}
        </div>
        <Link
          href={homePathFor(userRole)}
          className="inline-flex items-center gap-1 font-label-md text-label-md font-semibold text-primary"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  const nextOptions = getNextStatuses(operation.statut);
  const rapportEnvoyable = operation.statut === "Terminée" || operation.statut === "Rapportée";

  return (
    <div className="mx-auto max-w-5xl space-y-gutter-md p-margin-mobile lg:p-margin-desktop">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/operations"
            className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
                {operation.natureIntervention}
              </h1>
              <StatusBadge status={operation.statut} />
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Client : {operation.clientId?.nom || "—"} • Site : {operation.siteId?.nom || "—"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/operations/${id}/rapport`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant bg-surface px-4 py-2 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            Rapport PDF
          </a>
          {canEdit && rapportEnvoyable && (
            <button
              type="button"
              disabled={sendingEmail}
              onClick={handleSendReportEmail}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 font-label-md text-label-md font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
              title="Envoyer le rapport officiel par e-mail au client"
            >
              <span className="material-symbols-outlined text-[18px]">outgoing_mail</span>
              {sendingEmail ? "Envoi..." : "Envoyer au client"}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-xl border border-error/30 bg-error-container/20 px-3 py-2 font-label-md text-label-md font-semibold text-on-error-container hover:bg-error-container/40"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Supprimer
            </button>
          )}
        </div>
      </div>

      {emailSuccess && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-gutter-sm text-emerald-800 dark:text-emerald-300 font-label-md text-label-md">
          {emailSuccess}
        </div>
      )}

      {actionError && (
        <div className="rounded-xl bg-error-container p-gutter-sm text-on-error-container">
          {actionError}
        </div>
      )}


      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Colonne gauche/centre : Détails & Terrain */}
        <div className="space-y-6 lg:col-span-2">
          {/* Fiche synthétique */}
          <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md space-y-4">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              Détails de l&apos;intervention
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span className="block font-label-sm text-label-sm text-outline">Date & Heure prévues</span>
                <span className="font-body-md text-body-md text-on-surface font-semibold">
                  {new Date(operation.dateHeurePrevue).toLocaleString("fr-FR")} ({operation.dureeEstimeeMinutes} min)
                </span>
              </div>
              <div>
                <span className="block font-label-sm text-label-sm text-outline">Équipe</span>
                <span className="font-body-md text-body-md text-on-surface font-semibold">
                  {operation.equipeId?.nom || "Non affectée"}
                </span>
              </div>
              <div>
                <span className="block font-label-sm text-label-sm text-outline">Véhicule</span>
                <span className="font-body-md text-body-md text-on-surface font-semibold">
                  {operation.vehiculeId?.identification || "Non affecté"}
                </span>
              </div>
              <div>
                <span className="block font-label-sm text-label-sm text-outline">Site / Adresse</span>
                <span className="font-body-md text-body-md text-on-surface">
                  {operation.siteId?.adresse || "Non renseignée"}
                </span>
              </div>
            </div>

            {operation.informationsParticulieres && (
              <div className="rounded-xl bg-surface-container-low p-3">
                <span className="block font-label-sm text-label-sm font-bold text-outline">
                  Consignes / Informations particulières
                </span>
                <p className="font-body-md text-body-md text-on-surface mt-1">
                  {operation.informationsParticulieres}
                </p>
              </div>
            )}
          </div>

          {/* Saisie de terrain (Statut, Quantités, Signature) */}
          <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md space-y-6">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              Saisie Terrain & Changement de Statut
            </h2>

            {nextOptions.length === 0 ? (
              <p className="font-body-md text-body-md text-outline">
                L&apos;opération est dans le statut final ({operation.statut}). Aucune transition possible.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block font-label-md text-label-md font-semibold text-on-surface">
                    Changer le statut vers :
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {nextOptions.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setNextStatut(st)}
                        className={`rounded-xl border px-3 py-1.5 font-label-md text-label-md transition-all ${
                          nextStatut === st
                            ? "border-primary bg-primary-container font-bold text-on-primary"
                            : "border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-high"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-label-md text-label-md font-semibold text-on-surface">
                      Quantité collectée
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 500"
                      value={quantite}
                      onChange={(e) => setQuantite(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md font-semibold text-on-surface">
                      Unité
                    </label>
                    <select
                      value={unite}
                      onChange={(e) => setUnite(e.target.value as QuantiteUnite)}
                      className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                    >
                      <option value="Litres">Litres</option>
                      <option value="Kg">Kg</option>
                      <option value="M3">M3</option>
                      <option value="Bacs">Bacs</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-label-md text-label-md font-semibold text-on-surface">
                    Remarques Terrain
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Observations, incidents, état de la cuve..."
                    value={remarques}
                    onChange={(e) => setRemarques(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                  />
                </div>

                <div>
                  <label className="block font-label-md text-label-md font-semibold text-on-surface">
                    Nom du signataire client
                  </label>
                  <input
                    type="text"
                    placeholder="Nom et prénom du représentant client"
                    value={nomSignataire}
                    onChange={(e) => setNomSignataire(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                  />
                </div>

                <div>
                  <label className="block font-label-md text-label-md font-semibold text-on-surface mb-2">
                    Signature Client
                  </label>
                  <SignaturePad
                    onSignature={setSignatureData}
                    existingSignature={operation.signatureClient}
                  />
                </div>

                {nextStatut && (
                  <button
                    type="button"
                    disabled={statusLoading}
                    onClick={() => handleStatusChange(nextStatut as OperationStatus)}
                    className="w-full rounded-xl bg-primary px-4 py-3 font-label-md text-label-md font-bold text-on-primary shadow-sm hover:bg-primary/90 disabled:opacity-50"
                  >
                    {statusLoading ? "Enregistrement..." : `Valider la transition vers "${nextStatut}"`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Section Photos */}
          <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md space-y-4">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              Photos de l&apos;intervention
            </h2>
            <PhotoUpload
              operationId={id}
              existingPhotos={operation.photos}
              onPhotosChange={() => fetchDetail()}
            />
          </div>
        </div>

        {/* Colonne droite : Historique des statuts */}
        <div className="space-y-6">
          <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md space-y-4">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              Historique des Statuts
            </h2>
            <div className="space-y-3">
              {operation.historiqueStatuts?.map((h, i) => (
                <div key={i} className="flex items-start gap-3 border-l-2 border-primary/30 pl-3">
                  <div>
                    <div className="font-label-md text-label-md font-bold text-on-surface">
                      {h.statut}
                    </div>
                    <div className="font-label-sm text-label-sm text-outline">
                      {new Date(h.date).toLocaleString("fr-FR")}
                    </div>
                    {h.parUtilisateur && (
                      <div className="font-label-sm text-label-sm text-on-surface-variant">
                        Par : {h.parUtilisateur.nom}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
