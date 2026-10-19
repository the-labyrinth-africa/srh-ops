"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatApiError } from "@/frontend/design-system";
import { QUANTITE_UNITES, type QuantiteUnite } from "@/shared/operations/quantites";
import type { TraceabiliteView } from "../types";

const API_ERROR = "Impossible de charger la traçabilité. Vérifiez votre connexion puis réessayez.";

export function TracabiliteOperation({
  operationId,
  canEdit,
}: {
  operationId: string;
  canEdit: boolean;
}) {
  const [items, setItems] = useState<TraceabiliteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [identifiantSuivi, setIdentifiantSuivi] = useState("");
  const [typeDechet, setTypeDechet] = useState("");
  const [volume, setVolume] = useState("");
  const [unite, setUnite] = useState<QuantiteUnite>("Litres");
  const [traitement, setTraitement] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/operations/${operationId}/tracabilite`);
      const data = await response.json();
      if (!response.ok) {
        setError(formatApiError(data.error));
        return;
      }
      if (!Array.isArray(data.items)) {
        setError("Réponse de traçabilité invalide.");
        return;
      }
      setItems(data.items);
    } catch {
      setError(API_ERROR);
    } finally {
      setLoading(false);
    }
  }, [operationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setIdentifiantSuivi("");
    setTypeDechet("");
    setVolume("");
    setUnite("Litres");
    setTraitement("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/operations/${operationId}/tracabilite${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifiantSuivi,
            typeDechet,
            volume: Number(volume),
            unite,
            traitement,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setError(formatApiError(data.error));
        return;
      }
      setSuccess(editingId ? "Ligne de traçabilité mise à jour." : "Ligne de traçabilité enregistrée.");
      resetForm();
      await load();
    } catch {
      setError(API_ERROR);
    } finally {
      setSaving(false);
    }
  };

  const edit = (item: TraceabiliteView) => {
    setEditingId(item.id);
    setIdentifiantSuivi(item.identifiantSuivi);
    setTypeDechet(item.typeDechet);
    setVolume(String(item.volume));
    setUnite(item.unite);
    setTraitement(item.traitement);
    setError("");
    setSuccess("");
  };

  return (
    <section
      aria-labelledby={`traceabilite-title-${operationId}`}
      className="space-y-4 rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md"
    >
      <div>
        <h2
          id={`traceabilite-title-${operationId}`}
          className="font-headline-sm text-headline-sm font-bold text-on-surface"
        >
          Traçabilité des déchets
        </h2>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
          Identifiant de suivi, type de déchet, quantité collectée et traitement.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl bg-error-container p-3 text-on-error-container">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-800">
          {success}
        </div>
      )}

      {canEdit && (
        <form onSubmit={submit} className="space-y-3 rounded-xl bg-surface-container-low p-4">
          <h3 className="font-label-md text-label-md font-semibold text-on-surface">
            {editingId ? "Modifier une ligne" : "Ajouter un flux de déchets"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`tracking-id-${operationId}`} className="block font-label-sm text-label-sm font-semibold text-on-surface">
                Identifiant de suivi
              </label>
              <input
                id={`tracking-id-${operationId}`}
                required
                maxLength={80}
                value={identifiantSuivi}
                onChange={(event) => setIdentifiantSuivi(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                placeholder="Ex. BSD-2026-001"
              />
            </div>
            <div>
              <label htmlFor={`waste-type-${operationId}`} className="block font-label-sm text-label-sm font-semibold text-on-surface">
                Type de déchet
              </label>
              <input
                id={`waste-type-${operationId}`}
                required
                maxLength={120}
                value={typeDechet}
                onChange={(event) => setTypeDechet(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                placeholder="Ex. huiles usagées"
              />
            </div>
            <div>
              <label htmlFor={`waste-volume-${operationId}`} className="block font-label-sm text-label-sm font-semibold text-on-surface">
                Volume ou quantité
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id={`waste-volume-${operationId}`}
                  required
                  type="number"
                  min="0.001"
                  step="any"
                  value={volume}
                  onChange={(event) => setVolume(event.target.value)}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  placeholder="Ex. 250"
                />
                <select
                  aria-label="Unité de mesure"
                  value={unite}
                  onChange={(event) => setUnite(event.target.value as QuantiteUnite)}
                  className="min-h-11 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {QUANTITE_UNITES.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor={`waste-treatment-${operationId}`} className="block font-label-sm text-label-sm font-semibold text-on-surface">
                Traitement prévu / réalisé
              </label>
              <input
                id={`waste-treatment-${operationId}`}
                required
                maxLength={500}
                value={traitement}
                onChange={(event) => setTraitement(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                placeholder="Ex. valorisation, recyclage..."
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-xl bg-primary px-4 py-2 font-label-md text-label-md font-semibold text-on-primary hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : editingId ? "Enregistrer les modifications" : "Ajouter la ligne"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-11 rounded-xl border border-outline-variant bg-surface px-4 py-2 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <p role="status" className="text-on-surface-variant">Chargement de la traçabilité...</p>
      ) : error ? null : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant p-4 text-on-surface-variant">
          Aucune ligne de traçabilité pour cette opération.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-surface-container-high p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-label-md text-label-md font-bold text-on-surface">
                    {item.typeDechet}
                  </p>
                  <p className="break-all font-body-sm text-body-sm text-on-surface-variant">
                    Suivi : {item.identifiantSuivi}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface">
                    {item.volume} {item.unite} · {item.traitement}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    Saisi le {new Date(item.createdAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => edit(item)}
                      aria-label={`Modifier ${item.identifiantSuivi}`}
                      className="min-h-11 rounded-lg border border-outline-variant px-3 py-2 font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Modifier
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
