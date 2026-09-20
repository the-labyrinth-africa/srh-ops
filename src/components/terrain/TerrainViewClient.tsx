"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { getNextStatuses } from "@/lib/status-transitions";
import { compressImageFile } from "@/lib/image-compress";
import { formatApiError } from "@/lib/api-error";
import type { OperationStatus, QuantiteUnite } from "@/types";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOp, setSelectedOp] = useState<OperationTerrain | null>(null);

  // Status action form
  const [targetStatus, setTargetStatus] = useState<OperationStatus | null>(null);
  const [quantite, setQuantite] = useState("");
  const [unite, setUnite] = useState<QuantiteUnite>("Litres");
  const [remarques, setRemarques] = useState("");
  const [updating, setUpdating] = useState(false);

  // Signature & photos in field
  const [nomSignataire, setNomSignataire] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const pendingPhotosRef = useRef<string[]>([]);
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const equipeId = session?.user?.equipeId;

  const fetchMissions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const equipeParam = equipeId ? `&equipeId=${equipeId}` : "";
      const res = await fetch(`/api/operations?limit=50${equipeParam}`);
      if (!res.ok) {
        setOperations([]);
        setLoadError(
          res.status === 403
            ? "Aucune équipe ne vous est attribuée. Contactez un dispatcher."
            : "Impossible de charger vos missions."
        );
        return;
      }
      const data = await res.json();
      setOperations(data.items || []);
    } catch (err) {
      console.error(err);
      setOperations([]);
      setLoadError("Impossible de charger vos missions.");
    } finally {
      setLoading(false);
    }
  }, [equipeId]);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  function openActionModal(op: OperationTerrain, status: OperationStatus) {
    setSelectedOp(op);
    setTargetStatus(status);
    setQuantite(op.quantiteCollectee ? op.quantiteCollectee.toString() : "");
    setUnite(op.uniteQuantite || "Litres");
    setRemarques(op.remarquesTerrain || "");
    setNomSignataire(op.nomSignataireClient || "");
    setSignatureData(op.signatureClient || "");
    pendingPhotosRef.current = [];
    setPendingPhotoCount(0);
  }

  async function uploadPendingPhotos(opId: string) {
    if (pendingPhotosRef.current.length === 0) return;
    for (const dataUrl of pendingPhotosRef.current) {
      try {
        await fetch(`/api/operations/${opId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photo: dataUrl,
            nom: `terrain-${Date.now()}.jpg`,
          }),
        });
      } catch (err) {
        console.error("Erreur upload photo terrain:", err);
      }
    }
  }

  async function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOp || !targetStatus) return;

    setUpdating(true);

    try {
      const showSignature =
        targetStatus === "Terminée" ||
        targetStatus === "Rapportée" ||
        selectedOp.statut === "Terminée" ||
        selectedOp.statut === "En cours";

      if (pendingPhotosRef.current.length > 0) {
        await uploadPendingPhotos(selectedOp._id);
      }

      const res = await fetch(`/api/operations/${selectedOp._id}/statut`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statut: targetStatus,
          quantiteCollectee: quantite ? parseFloat(quantite) : undefined,
          uniteQuantite: unite,
          remarquesTerrain: remarques,
          ...(showSignature
            ? {
                nomSignataireClient: nomSignataire,
                signatureClient: signatureData,
              }
            : {}),
        }),
      });

      setUpdating(false);
      if (res.ok) {
        if (targetStatus === "Rapportée") {
          try {
            await fetch(`/api/operations/${selectedOp._id}/rapport`);
          } catch (err) {
            console.error("Erreur génération rapport:", err);
          }
        }
        setSelectedOp(null);
        setTargetStatus(null);
        fetchMissions();
      } else {
        const data = await res.json();
        alert(formatApiError(data.error, "Erreur lors du changement de statut"));
      }
    } catch (err) {
      setUpdating(false);
      console.error(err);
    }
  }

  async function handlePhotoSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoUploading(true);

    // Redimensionnement local : l'API plafonne chaque photo à 2 Mo.
    const refused: string[] = [];
    const dataUrls = await Promise.all(
      Array.from(files).map(async (file) => {
        try {
          const url = await compressImageFile(file);
          if (!url) refused.push(`${file.name} : photo trop volumineuse, même après compression`);
          return url;
        } catch (err) {
          refused.push(`${file.name} : ${err instanceof Error ? err.message : "photo illisible"}`);
          return null;
        }
      })
    );

    pendingPhotosRef.current = [
      ...pendingPhotosRef.current,
      ...dataUrls.filter((url): url is string => Boolean(url)),
    ];
    setPendingPhotoCount(pendingPhotosRef.current.length);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    setPhotoUploading(false);

    if (refused.length > 0) {
      alert(`${refused.length} photo(s) refusée(s) :\n${refused.join("\n")}`);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-margin-mobile py-gutter-md lg:px-margin-desktop max-w-4xl mx-auto">
      {/* Header Web/PWA Terrain */}
      <div className="flex items-center justify-between rounded-2xl bg-primary p-5 text-on-primary shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px]">local_shipping</span>
            <h1 className="font-headline-md text-headline-md font-bold">Console Web Terrain</h1>
          </div>
          <p className="mt-1 text-xs opacity-90">
            {session?.user?.name} — {session?.user?.equipeId ? "Équipe affectée" : "Toutes les interventions du jour"}
          </p>
        </div>
        <button
          onClick={fetchMissions}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-on-primary/10 hover:bg-on-primary/20"
          title="Rafraîchir"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center font-body-md text-on-surface-variant">Chargement de vos missions...</div>
      ) : loadError ? (
        <div role="alert" className="p-8 text-center font-body-md text-error rounded-2xl bg-surface-container-lowest border">
          {loadError}
        </div>
      ) : operations.length === 0 ? (
        <div className="p-8 text-center font-body-md text-on-surface-variant rounded-2xl bg-surface-container-lowest border">
          Aucune mission affectée pour le moment.
        </div>
      ) : (
        <div className="space-y-4">
          {operations.map((op) => {
            const nextStatuses = getNextStatuses(op.statut);
            const hasSignature = Boolean(op.signatureClient);
            const hasPhotos = (op.photos?.length ?? 0) > 0;

            return (
              <div
                key={op._id}
                className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest p-5 shadow-sm border transition-all hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-primary">#{op._id.slice(-6).toUpperCase()}</span>
                    <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">{op.natureIntervention}</h2>
                    <div className="font-body-md text-body-md font-bold text-on-surface mt-1">
                      📍 {op.clientId?.nom} — <span className="font-normal text-on-surface-variant">{op.siteId?.nom}</span>
                    </div>
                    <div className="text-xs text-outline mt-0.5">{op.siteId?.adresse}</div>
                  </div>
                  <StatusBadge status={op.statut} />
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant bg-surface-container-low p-3 rounded-xl">
                  <div>🕒 Prev: <strong>{new Date(op.dateHeurePrevue).toLocaleString("fr-FR")}</strong></div>
                  <div>🚚 Véhicule: <strong>{op.vehiculeId?.identification || "—"}</strong></div>
                  {op.quantiteCollectee !== undefined && op.quantiteCollectee > 0 && (
                    <div className="text-primary font-bold">
                      🛢️ Collecté: {op.quantiteCollectee} {op.uniteQuantite || "L"}
                    </div>
                  )}
                  {hasSignature && (
                    <div className="text-status-completed font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">draw</span> Signé
                    </div>
                  )}
                  {hasPhotos && (
                    <div className="text-secondary font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">photo_library</span> {op.photos?.length} photo(s)
                    </div>
                  )}
                </div>

                {op.informationsParticulieres && (
                  <div className="text-xs text-on-surface-variant italic bg-surface-container-low/50 p-2.5 rounded-lg border-l-2 border-primary">
                    Consigne: {op.informationsParticulieres}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <Link
                    href={`/operations/${op._id}`}
                    className="font-label-md text-label-md text-primary hover:underline flex items-center gap-1"
                  >
                    Voir le détail
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  </Link>

                  <div className="flex flex-wrap items-center gap-2">
                    {nextStatuses.map((st) => (
                      <button
                        key={st}
                        onClick={() => openActionModal(op, st)}
                        className="flex items-center gap-1 rounded-xl bg-primary px-3.5 py-2 font-label-md text-label-md text-on-primary shadow-sm hover:bg-primary-container"
                      >
                        <span>Passer &quot;{st}&quot;</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de confirmation de statut, quantité, photos & signature */}
      {selectedOp && targetStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-surface-container-lowest p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                Passer en &quot;{targetStatus}&quot;
              </h3>
              <button
                onClick={() => {
                  setSelectedOp(null);
                  setTargetStatus(null);
                }}
                className="rounded-lg p-1 hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="font-body-md text-body-md text-on-surface-variant">
              Mission: <strong>{selectedOp.natureIntervention}</strong> — {selectedOp.siteId?.nom}
            </p>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              {(targetStatus === "Terminée" || targetStatus === "En cours" || selectedOp.statut === "En cours") && (
                <>
                  <div>
                    <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                      Quantité de déchets collectée
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quantite}
                        onChange={(e) => setQuantite(e.target.value)}
                        placeholder="Ex: 1500"
                        className="h-11 flex-1 rounded-xl bg-surface-container-low px-3 font-headline-sm text-headline-sm font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary"
                      />
                      <select
                        value={unite}
                        onChange={(e) => setUnite(e.target.value as QuantiteUnite)}
                        className="h-11 rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="Litres">Litres</option>
                        <option value="Kg">Kg</option>
                        <option value="M3">m³</option>
                        <option value="Bacs">Bacs</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                      Observations / Remarques terrain
                    </label>
                    <textarea
                      rows={2}
                      value={remarques}
                      onChange={(e) => setRemarques(e.target.value)}
                      placeholder="Remarques éventuelles sur la collecte..."
                      className="w-full rounded-xl bg-surface-container-low p-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </>
              )}

              {(targetStatus === "Terminée" || targetStatus === "Rapportée" || selectedOp.statut === "En cours" || selectedOp.statut === "Terminée") && (
                <>
                  <div className="border-t border-outline-variant/30 pt-4">
                    <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                      Photos de l&apos;intervention
                    </label>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handlePhotoSelect(e.target.files)}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handlePhotoSelect(e.target.files)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoUploading}
                        className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
                        {photoUploading ? "Lecture..." : "Ajouter photos"}
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={photoUploading}
                        className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                        Prendre une photo
                      </button>
                    </div>
                    {pendingPhotoCount > 0 && (
                      <p className="mt-2 font-label-sm text-label-sm text-primary">
                        {pendingPhotoCount} photo(s) sélectionnée(s) — seront jointes au rapport
                      </p>
                    )}
                  </div>

                  <div className="border-t border-outline-variant/30 pt-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-primary">draw</span>
                      <label className="font-label-md text-label-md text-on-surface-variant">
                        Signature du client {targetStatus === "Rapportée" ? "(obligatoire)" : ""}
                      </label>
                    </div>
                    <input
                      type="text"
                      value={nomSignataire}
                      onChange={(e) => setNomSignataire(e.target.value)}
                      placeholder="Nom du représentant client"
                      className="mb-2 h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                    />
                    <SignaturePad
                      onSignature={setSignatureData}
                      width={400}
                      height={150}
                      existingSignature={selectedOp.signatureClient || undefined}
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 border-t pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOp(null);
                    setTargetStatus(null);
                  }}
                  className="rounded-xl bg-surface-container-high px-4 py-2 font-label-md text-label-md text-on-surface"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  {updating ? "Mise à jour..." : "Confirmer le changement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}