"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatusBadge, SignaturePad, formatApiError } from "@/frontend/design-system";
import { getNextStatuses } from "@/shared/operations/transitions";
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
  clientId?: { nom: string };
  siteId?: { nom: string; adresse: string };
  equipeId?: { _id: string; nom: string };
  vehiculeId?: { identification: string };
  informationsParticulieres?: string;
}

export function TerrainViewClient() {
  const { data: session } = useSession();
  const [operations, setOperations] = useState<OperationTerrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOp, setSelectedOp] = useState<OperationTerrain | null>(null);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  // Formulaire d'édition de terrain
  const [nextStatut, setNextStatut] = useState<OperationStatus | "">("");
  const [quantite, setQuantite] = useState("");
  const [unite, setUnite] = useState<QuantiteUnite>("Litres");
  const [remarques, setRemarques] = useState("");
  const [nomSignataire, setNomSignataire] = useState("");
  const [signatureData, setSignatureData] = useState("");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fetchTerrainOps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operations");
      if (res.ok) {
        const data = await res.json();
        setOperations(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // Ignorer
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
    setActionError("");
  };

  const handleUpdateStatus = async (targetStatus: OperationStatus) => {
    if (!selectedOp) return;
    setActionError("");
    setSaving(true);

    try {
      const payload = {
        statut: targetStatus,
        quantiteCollectee: quantite ? Number(quantite) : undefined,
        uniteQuantite: quantite ? unite : undefined,
        remarquesTerrain: remarques || undefined,
        nomSignataireClient: nomSignataire || undefined,
        signatureClient: signatureData || undefined,
      };

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

      await fetchTerrainOps();
      setSelectedOp(null);
    } catch {
      setActionError("Erreur réseau lors de la mise à jour.");
    } finally {
      setSaving(false);
    }
  };

  const handleTakePhoto = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedOp) return;
    setActionError("");
    setUploadingPhoto(true);

    try {
      const file = files[0];
      const dataUrl = await compressImageFile(file);
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
      await fetchTerrainOps();
    } catch {
      setActionError("Erreur lors de l'envoi de la photo.");
    } finally {
      setUploadingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
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
            {session?.user?.name || "Chauffeur"}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-surface-container-high p-2 text-on-surface-variant hover:text-on-surface"
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

          {actionError && (
            <div className="rounded-xl bg-error-container p-3 font-body-md text-body-md text-on-error-container">
              {actionError}
            </div>
          )}

          {/* Formulaire terrain */}
          <div className="space-y-4 pt-2 border-t border-surface-container-high">
            <div>
              <label className="block font-label-md text-label-md font-semibold text-on-surface">
                Changer le statut :
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {getNextStatuses(selectedOp.statut).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setNextStatut(st)}
                    className={`rounded-xl border px-3 py-2 font-label-md text-label-md transition-all ${
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-label-md text-label-md font-semibold text-on-surface">
                  Quantité
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
                Remarques
              </label>
              <textarea
                rows={2}
                placeholder="Remarques..."
                value={remarques}
                onChange={(e) => setRemarques(e.target.value)}
                className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
              />
            </div>

            <div>
              <label className="block font-label-md text-label-md font-semibold text-on-surface">
                Nom du signataire
              </label>
              <input
                type="text"
                placeholder="Nom du client"
                value={nomSignataire}
                onChange={(e) => setNomSignataire(e.target.value)}
                className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
              />
            </div>

            <div>
              <label className="block font-label-md text-label-md font-semibold text-on-surface mb-2">
                Signature
              </label>
              <SignaturePad
                onSignature={setSignatureData}
                existingSignature={selectedOp.signatureClient}
              />
            </div>

            {/* Envoi de photo par appareil photo mobile */}
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
                {uploadingPhoto ? "Prise de photo..." : "Prendre une photo"}
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

            {nextStatut && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleUpdateStatus(nextStatut as OperationStatus)}
                className="w-full rounded-xl bg-primary px-4 py-3.5 font-label-md text-label-md font-bold text-on-primary shadow-md hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Mise à jour..." : `Valider "${nextStatut}"`}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Liste des opérations du chauffeur */
        <div className="space-y-3">
          {loading ? (
            <div className="p-gutter-md text-center text-outline">Chargement des opérations...</div>
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
