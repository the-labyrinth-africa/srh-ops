"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatusBadge, SignaturePad, formatApiError } from "@/frontend/design-system";
import { TracabiliteOperation } from "@/frontend/tracabilite";
import { getNextStatuses } from "@/shared/operations/transitions";
import { canWrite, isChauffeur } from "@/shared/acces/permissions";
import { compressImageFile } from "../utils/image-compress";
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";

interface OperationTerrain {
  _id: string;
  natureIntervention: string;
  dateHeurePrevue: string;
  statut: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
  photos?: { url: string; nom: string }[];
  clientId?: { nom: string; contact?: { email?: string; telephone?: string } };
  siteId?: { nom: string; adresse: string };
  equipeId?: { _id: string; nom: string };
  vehiculeId?: { identification: string };
  informationsParticulieres?: string;
}

export function TerrainViewClient() {
  const { data: session } = useSession();
  const canEditTraceabilite = canWrite(session?.user?.role) || isChauffeur(session?.user?.role);

  const [operations, setOperations] = useState<OperationTerrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedOp, setSelectedOp] = useState<OperationTerrain | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  // Formulaire d'édition de terrain
  const [nextStatut, setNextStatut] = useState<OperationStatus | "">("");
  const [quantite, setQuantite] = useState("");
  const [unite, setUnite] = useState<QuantiteUnite>("Litres");
  const [remarques, setRemarques] = useState("");
  const [nomSignataire, setNomSignataire] = useState("");
  const [signatureData, setSignatureData] = useState("");

  // Envoi de rapport par email
  const [emailClient, setEmailClient] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fetchTerrainOps = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/operations");
      const data = await res.json();
      if (!res.ok) {
        setListError(formatApiError(data.error));
        return;
      }
      setOperations(Array.isArray(data.items) ? data.items : []);
    } catch {
      setListError("Impossible de charger les opérations. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTerrainOps();
  }, [fetchTerrainOps]);

  const selectOperation = (op: OperationTerrain) => {
    setSelectedOp(op);
    setNextStatut("");
    setQuantite(op.quantiteCollectee ? String(op.quantiteCollectee) : "");
    setUnite(op.uniteQuantite || "Litres");
    setRemarques(op.remarquesTerrain || "");
    setNomSignataire(op.nomSignataireClient || "");
    setSignatureData(op.signatureClient || "");
    setEmailClient(op.clientId?.contact?.email || "");
    setShowEmailInput(false);
    setActionError("");
    setActionSuccess("");
  };

  const handleUpdateStatus = async (targetStatus: OperationStatus) => {
    if (!selectedOp) return;
    setActionError("");
    setActionSuccess("");
    setSaving(true);

    const payload = {
      statut: targetStatus,
      quantiteCollectee: quantite ? Number(quantite) : undefined,
      uniteQuantite: quantite ? unite : undefined,
      remarquesTerrain: remarques || undefined,
      nomSignataireClient: nomSignataire || undefined,
      signatureClient: signatureData || undefined,
    };

    try {
      const res = await fetch(`/api/operations/${selectedOp._id}/statut`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setActionError(formatApiError(data.error));
        return;
      }

      setActionSuccess(`Statut mis à jour : ${targetStatus}`);
      await fetchTerrainOps();
      setSelectedOp((prev) => (prev ? { ...prev, ...payload, statut: targetStatus } : null));
    } catch {
      setActionError("Impossible de mettre à jour le statut. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setSaving(false);
    }
  };

  const handleTakePhoto = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedOp) return;
    setActionError("");
    setActionSuccess("");
    setUploadingPhoto(true);

    let dataUrl: string | null = null;
    try {
      const file = files[0];
      dataUrl = await compressImageFile(file);
      if (!dataUrl) {
        setActionError("Image trop lourde même après compression.");
        return;
      }

      const res = await fetch(`/api/operations/${selectedOp._id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: dataUrl, nom: file.name }),
      });

      if (!res.ok) {
        const data = await res.json();
        setActionError(formatApiError(data.error));
        return;
      }

      const saved = await res.json();
      setSelectedOp((prev) =>
        prev
          ? {
              ...prev,
              photos: [...(prev.photos || []), saved.photo],
            }
          : null
      );
      setActionSuccess("Photo ajoutée avec succès.");
      await fetchTerrainOps();
    } catch {
      setActionError("Impossible d'enregistrer la photo. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setUploadingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleSendReportEmail = async () => {
    if (!selectedOp) return;
    setActionError("");
    setActionSuccess("");
    setSendingEmail(true);

    try {
      const res = await fetch(`/api/operations/${selectedOp._id}/rapport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailClient || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionError(formatApiError(data.error));
        return;
      }

      setActionSuccess(`Rapport officiel envoyé par e-mail à ${data.destinataire}.`);
      setShowEmailInput(false);
      setSelectedOp((prev) => (prev ? { ...prev, statut: "Rapportée" } : null));
      setOperations((prev) =>
        prev.map((op) => (op._id === selectedOp._id ? { ...op, statut: "Rapportée" } : op))
      );
    } catch {
      setActionError("Erreur réseau lors de l'envoi du rapport par e-mail.");
    } finally {
      setSendingEmail(false);
    }
  };

  const operationsAffichees = Array.isArray(operations) ? operations : [];

  return (
    <div className="mx-auto max-w-lg space-y-gutter-md p-margin-mobile">
      {/* En-tête mobile */}
      <div className="flex items-center justify-between rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-sm">
        <div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">
            Console Terrain
          </h1>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {session?.user?.name || "Chauffeur"} • WOM
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-surface-container-high p-2 text-on-surface-variant hover:text-on-surface"
          title="Accueil"
        >
          <span className="material-symbols-outlined text-[20px]">home</span>
        </Link>
      </div>

      {/* Vue détail / action sur opération sélectionnée */}
      {selectedOp ? (
        <div className="space-y-4 rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md shadow-sm">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedOp(null)}
              className="flex items-center gap-1 font-label-md text-label-md font-semibold text-primary"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Retour aux opérations
            </button>
            <StatusBadge status={selectedOp.statut} compact />
          </div>

          <div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {selectedOp.natureIntervention}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant font-semibold mt-0.5">
              {selectedOp.clientId?.nom || "Client inconnu"}
            </p>
            <p className="font-label-sm text-label-sm text-outline mt-0.5">
              {selectedOp.siteId?.nom} • {selectedOp.siteId?.adresse}
            </p>
          </div>

          {selectedOp.informationsParticulieres && (
            <div className="rounded-xl bg-surface-container-low p-3">
              <span className="font-label-sm text-label-sm font-bold text-outline uppercase">Consignes</span>
              <p className="font-body-md text-body-md text-on-surface mt-0.5">
                {selectedOp.informationsParticulieres}
              </p>
            </div>
          )}

          <TracabiliteOperation operationId={selectedOp._id} canEdit={canEditTraceabilite} />

          {actionSuccess && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 font-body-md text-body-md text-emerald-800 dark:text-emerald-300">
              {actionSuccess}
            </div>
          )}

          {actionError && (
            <div className="rounded-xl bg-error-container p-3 font-body-md text-body-md text-on-error-container">
              {actionError}
            </div>
          )}

          {/* Action rapide selon le stade actuel de l'intervention (PDF §6) */}
          <div className="pt-2 border-t border-surface-container-high space-y-3">
            {(selectedOp.statut === "Planifiée" || selectedOp.statut === "Affectée") && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleUpdateStatus("En route")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-label-md text-label-md font-bold text-on-primary shadow-md hover:bg-primary/90 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">directions_car</span>
                {saving ? "Mise à jour..." : "1. Prendre la route (En route)"}
              </button>
            )}

            {selectedOp.statut === "En route" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleUpdateStatus("En cours")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-label-md text-label-md font-bold text-on-primary shadow-md hover:bg-primary/90 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">pin_drop</span>
                {saving ? "Mise à jour..." : "2. Arrivé sur site (Passer En cours)"}
              </button>
            )}

            {/* Formulaire de collecte (actif quand en cours ou modifiable) */}
            {(selectedOp.statut === "En cours" || selectedOp.statut === "Retardée" || nextStatut) && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-label-md text-label-md font-semibold text-on-surface">
                      Quantité collectée
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={quantite}
                      onChange={(e) => setQuantite(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 font-body-md text-body-md text-on-surface outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md font-semibold text-on-surface">
                      Unité
                    </label>
                    <select
                      value={unite}
                      onChange={(e) => setUnite(e.target.value as QuantiteUnite)}
                      className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 font-body-md text-body-md text-on-surface outline-none"
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
                    Remarques terrain
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Observations, état du bac, propreté..."
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
                    placeholder="Nom du responsable sur site"
                    value={nomSignataire}
                    onChange={(e) => setNomSignataire(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                  />
                </div>

                <div>
                  <label className="block font-label-md text-label-md font-semibold text-on-surface mb-2">
                    Signature du client
                  </label>
                  <SignaturePad
                    onSignature={setSignatureData}
                    existingSignature={selectedOp.signatureClient}
                  />
                </div>

                {/* Prise de photos terrain */}
                <div>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleTakePhoto(e.target.files)}
                  />
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                    {uploadingPhoto ? "Traitement de la photo..." : "Prendre une photo"}
                  </button>

                  {selectedOp.photos && selectedOp.photos.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedOp.photos.map((p, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={p.url}
                          alt={p.nom}
                          className="h-16 w-16 rounded-lg object-cover border border-outline-variant"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {selectedOp.statut === "En cours" && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleUpdateStatus("Terminée")}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-label-md text-label-md font-bold text-on-primary shadow-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px]">task_alt</span>
                    {saving ? "Enregistrement..." : "3. Clôturer l'intervention (Terminée)"}
                  </button>
                )}
              </div>
            )}

            {/* Actions post-intervention : rapport PDF et e-mail client */}
            {(selectedOp.statut === "Terminée" || selectedOp.statut === "Rapportée") && (
              <div className="space-y-3 pt-2">
                {selectedOp.statut === "Rapportée" && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-emerald-800 dark:text-emerald-300 font-label-md text-label-md font-semibold">
                    <span className="material-symbols-outlined text-[20px]">mark_email_read</span>
                    Rapport officiel transmis au client
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <a
                    href={`/api/operations/${selectedOp._id}/rapport`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-3 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
                  >
                    <span className="material-symbols-outlined text-[20px]">download</span>
                    Télécharger le PDF
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowEmailInput((v) => !v)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-label-md text-label-md font-bold text-on-primary hover:bg-primary/90"
                  >
                    <span className="material-symbols-outlined text-[20px]">send</span>
                    Envoyer par e-mail
                  </button>
                </div>

                {showEmailInput && (
                  <div className="rounded-xl border border-primary/30 bg-surface-container-low p-4 space-y-3">
                    <label className="block font-label-md text-label-md font-semibold text-on-surface">
                      Adresse e-mail de réception du client :
                    </label>
                    <input
                      type="email"
                      placeholder="contact@client.ci"
                      value={emailClient}
                      onChange={(e) => setEmailClient(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                    />
                    <button
                      type="button"
                      disabled={sendingEmail || !emailClient}
                      onClick={handleSendReportEmail}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-bold text-on-primary hover:bg-primary/90 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">outgoing_mail</span>
                      {sendingEmail ? "Envoi du rapport..." : "Envoyer le rapport"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Sélecteur de statut libre pour cas exceptionnels (Retardée, Annulée) */}
            <div className="pt-2">
              <details className="text-xs text-outline cursor-pointer">
                <summary className="font-semibold hover:text-on-surface py-1">
                  Changement de statut alternatif (Retardée, Annulée)...
                </summary>
                <div className="mt-2 flex flex-wrap gap-2 pt-2 border-t border-surface-container-high">
                  {getNextStatuses(selectedOp.statut).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setNextStatut(st)}
                      className={`rounded-xl border px-3 py-1.5 font-label-sm text-label-sm transition-all ${
                        nextStatut === st
                          ? "border-primary bg-primary-container font-bold text-on-primary"
                          : "border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      Passer à « {st} »
                    </button>
                  ))}
                </div>
                {nextStatut && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleUpdateStatus(nextStatut as OperationStatus)}
                    className="mt-3 w-full rounded-xl bg-surface-container-high px-3 py-2 font-label-md text-label-md font-bold text-on-surface hover:bg-surface-container-highest"
                  >
                    Valider le statut « {nextStatut} »
                  </button>
                )}
              </details>
            </div>
          </div>
        </div>
      ) : (
        /* Liste des opérations du chauffeur */
        <div className="space-y-3">
          {loading ? (
            <div className="p-gutter-md text-center text-outline">Chargement des opérations...</div>
          ) : listError ? (
            <div role="alert" className="rounded-xl border border-error/30 bg-error-container p-gutter-md text-center text-on-error-container">
              <p>{listError}</p>
              <button
                type="button"
                onClick={() => void fetchTerrainOps()}
                className="mt-3 rounded-lg bg-primary px-4 py-2 font-label-md text-label-md font-semibold text-on-primary"
              >
                Réessayer
              </button>
            </div>
          ) : operationsAffichees.length === 0 ? (
            <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md text-center text-outline">
              Aucune opération affectée à votre équipe.
            </div>
          ) : (
            operationsAffichees.map((op) => (
              <button
                key={op._id}
                type="button"
                onClick={() => selectOperation(op)}
                className="w-full text-left rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md shadow-sm transition-all hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface block">
                      {op.natureIntervention}
                    </span>
                    <span className="font-body-md text-body-md font-semibold text-on-surface-variant block mt-0.5">
                      {op.clientId?.nom || "Client inconnu"}
                    </span>
                  </div>
                  <StatusBadge status={op.statut} compact />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-label-sm text-label-sm text-outline">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    {new Date(op.dateHeurePrevue).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="flex items-center gap-1 truncate">
                    <span className="material-symbols-outlined text-[16px]">location_on</span>
                    {op.siteId?.nom}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
