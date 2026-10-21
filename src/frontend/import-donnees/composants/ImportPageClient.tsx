"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { canWrite } from "@/shared/acces/permissions";
import { useUniteQuantiteGlobale } from "@/frontend/parametres";

interface ApercuRow {
  site: string;
  date: string;
  quantite: number;
  rowNumber: number;
}

interface PreviewSummary {
  fileName: string;
  totalRows: number;
  skippedRows: number;
  errors: { row: number; message: string }[];
  uniqueSites: number;
  totalQuantite: number;
  uniteApercu: string;
  dateMin: string;
  dateMax: string;
  apercu: ApercuRow[];
}

export function ImportPageClient() {
  const { data: session } = useSession();
  const { uniteQuantiteGlobale } = useUniteQuantiteGlobale();
  const canImport = canWrite(session?.user?.role);
  const [dragOver, setDragOver] = useState(false);
  const [showAllPreviewRows, setShowAllPreviewRows] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    duplicates: number;
    summary: PreviewSummary;
    clientId: string;
  } | null>(null);
  const [natureIntervention, setNatureIntervention] = useState(
    "Collecte d'huiles usagées"
  );
  const [clients, setClients] = useState<{ _id: string; nom: string }[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState("");
  const uniteApercu = uniteQuantiteGlobale ?? preview?.uniteApercu ?? "Litres";

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsError("");
    try {
      const response = await fetch("/api/clients");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(typeof data.error === "string" ? data.error : "Impossible de charger la liste des clients.");
      }
      setClients(data);
    } catch (cause) {
      setClientsError(cause instanceof Error ? cause.message : "Impossible de charger la liste des clients.");
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  async function runPreview(f: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    setPreview(null);

    try {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("mode", "preview");

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        const details = Array.isArray(data.errors)
          ? data.errors.slice(0, 5).map((item: { message?: string }) => item.message).filter(Boolean).join("\n")
          : "";
        setError([data.error || "Erreur lors de l'analyse du fichier.", details].filter(Boolean).join("\n"));
        return;
      }
      setPreview(data.summary);
      setShowAllPreviewRows(false);
    } catch {
      setError("Erreur lors de l'analyse du fichier.");
    } finally {
      setLoading(false);
    }
  }

  const handleFile = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (ext !== "xlsx") {
        setError("Seuls les fichiers Excel .xlsx sont acceptés.");
        return;
      }
      if (f.size > 5 * 1024 * 1024) {
        setError("Le fichier dépasse 5 Mo. Découpez le classeur avant de l'importer.");
        return;
      }
      setFile(f);
      setShowAllPreviewRows(false);
      runPreview(f);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    []
  );

  async function runImport() {
    if (!file) return;
    if (!clientId) {
      setError("Sélectionnez le client destinataire avant de lancer l'import.");
      return;
    }
    setImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "import");
      formData.append("clientId", clientId);
      formData.append("natureIntervention", natureIntervention);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'import.");
        return;
      }
      setResult(data);
    } catch {
      setError("Erreur lors de l'import des données.");
    } finally {
      setImporting(false);
    }
  }

  if (!canImport) {
    return (
      <div className="flex flex-col gap-4 p-margin-mobile lg:p-margin-desktop">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error">
            <span className="material-symbols-outlined">lock</span>
          </div>
          <h1 className="font-headline-sm text-headline-sm text-on-surface">Accès restreint</h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Seuls les administrateurs et dispatchers peuvent importer des fichiers Excel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-gutter-md p-margin-mobile lg:p-margin-desktop max-w-4xl mx-auto">
      <div>
        <nav className="mb-2 flex items-center gap-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
          <Link href="/operations" className="hover:text-primary">Opérations</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="font-bold text-on-surface">Import Excel</span>
        </nav>
        <h1 className="break-words font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
          Import des interventions sur site
        </h1>
        <p className="mt-2 max-w-2xl font-body-md text-body-md leading-6 text-on-surface-variant">
          Importez un fichier Excel (SITES, DATES, QTES) pour alimenter la base d&apos;interventions.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-error/20 bg-error-container/20 p-4">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[20px] text-error">error</span>
            <div className="whitespace-pre-line font-body-md text-body-md text-on-error-container">{error}</div>
          </div>
        </div>
      )}

      {!file ? (
        <>
        <input
          ref={fileInputRef}
          id="excel-import-file"
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
          aria-label="Choisir un fichier Excel"
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`rounded-3xl border-2 border-dashed p-6 text-center transition-colors sm:p-10 ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-outline-variant bg-surface-container-lowest"
          }`}
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <span className="material-symbols-outlined text-[28px]">upload_file</span>
          </div>
          <h2 className="break-words font-headline-sm text-headline-sm text-on-surface">
            Glissez votre fichier Excel ici
          </h2>
          <p className="mx-auto mt-1 max-w-xl font-body-md text-body-md leading-6 text-on-surface-variant">
            Vous pouvez aussi choisir un fichier .xlsx depuis votre appareil (5 Mo maximum).
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 min-h-11 rounded-xl bg-primary px-5 py-2 font-label-md text-label-md font-bold text-on-primary hover:bg-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Choisir un fichier
          </button>
          <p className="mt-4 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-surface-container-low px-4 py-2 font-label-sm text-label-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">table_chart</span>
            Format attendu : colonnes « SITES », « DATES », « QTES »
          </p>
        </div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                <span className="material-symbols-outlined">table_chart</span>
              </div>
              <div className="min-w-0">
                <p title={file.name} className="break-words [overflow-wrap:anywhere] font-label-md text-label-md font-bold text-on-surface">{file.name}</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {(file.size / 1024).toFixed(0)} Ko
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setResult(null);
                setError(null);
              }}
              aria-label="Choisir un autre fichier"
              title="Choisir un autre fichier"
              className="rounded-xl bg-surface-container-high p-2 text-on-surface-variant hover:bg-surface-container-highest"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
            <label
              htmlFor="import-client"
              className="font-label-md text-label-md text-on-surface-variant"
            >
              Client destinataire (obligatoire)
            </label>
            <select
              id="import-client"
              required
              disabled={clientsLoading || Boolean(clientsError)}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— Sélectionner un client —</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.nom}
                </option>
              ))}
            </select>
            <p className="font-label-sm text-label-sm text-outline">
              Les sites et opérations importés sont rattachés à ce client.
            </p>
            {clientsLoading && <p role="status" className="text-sm text-on-surface-variant">Chargement des clients…</p>}
            {clientsError && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-error" role="alert">
                <span>{clientsError}</span>
                <button type="button" onClick={() => void loadClients()} className="min-h-10 rounded-lg px-3 font-bold underline">
                  Réessayer
                </button>
              </div>
            )}
            {!clientsLoading && !clientsError && clients.length === 0 && (
              <p role="status" className="text-sm text-on-surface-variant">Aucun client n&apos;est disponible. Créez un client avant de lancer l&apos;import.</p>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
            <label htmlFor="import-nature" className="font-label-md text-label-md text-on-surface-variant">
              Nature de l&apos;intervention (appliquée à toutes les lignes importées)
            </label>
            <input
              id="import-nature"
              type="text"
              value={natureIntervention}
              onChange={(e) => setNatureIntervention(e.target.value)}
              className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </>
      )}

      {loading && (
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="font-body-md text-body-md text-on-surface-variant">
            Analyse du fichier en cours...
          </span>
        </div>
      )}

      {preview && !loading && !result && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="min-w-0 rounded-2xl border bg-surface-container-lowest p-4 text-center">
              <p className="font-kpi-value text-kpi-value text-primary">{preview.totalRows}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Lignes détectées</p>
            </div>
            <div className="min-w-0 rounded-2xl border bg-surface-container-lowest p-4 text-center">
              <p className="font-kpi-value text-kpi-value text-primary">{preview.uniqueSites}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Sites</p>
            </div>
            <div className="min-w-0 rounded-2xl border bg-surface-container-lowest p-4 text-center">
              <p className="font-kpi-value text-kpi-value text-primary">
                {preview.totalQuantite.toLocaleString("fr-FR")}
              </p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Litres</p>
            </div>
            <div className="min-w-0 rounded-2xl border bg-surface-container-lowest p-4 text-center">
              <p className="flex flex-col items-center justify-center gap-1 text-base leading-6 text-primary sm:flex-row sm:flex-wrap">
                <span>{new Date(preview.dateMin).toLocaleDateString("fr-FR")}</span>
                <span aria-hidden="true">→</span>
                <span>{new Date(preview.dateMax).toLocaleDateString("fr-FR")}</span>
              </p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Période</p>
            </div>
          </div>

          {preview.skippedRows > 0 && (
            <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-4">
              <p className="font-label-md text-label-md text-on-surface">
                {preview.skippedRows} ligne(s) ignorée(s)
                {preview.errors.length > 0 && ` · ${preview.errors.length} anomalie(s) à vérifier`}
              </p>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                Les lignes vides et les collectes sans quantité positive ne sont pas importées.
              </p>
              {preview.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="min-h-11 cursor-pointer py-2 font-label-md text-label-md font-semibold text-primary">
                    Voir les {preview.errors.length} anomalie(s)
                  </summary>
                  <ul className="space-y-2 pl-5 text-sm leading-6 text-on-surface-variant">
                    {preview.errors.slice(0, 8).map((item, index) => (
                      <li key={`${item.row}-${index}`} className="list-disc">{item.message}</li>
                    ))}
                    {preview.errors.length > 8 && (
                      <li className="list-none">… et {preview.errors.length - 8} autre(s)</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}

          {preview.apercu.length > 0 && (
            <div className="overflow-hidden rounded-2xl bg-surface-container shadow-sm">
              {preview.apercu.length > 10 && (
                <div className="flex justify-center border-b border-outline-variant/30 p-3">
                  <button
                    type="button"
                    aria-expanded={showAllPreviewRows}
                    onClick={() => setShowAllPreviewRows((visible) => !visible)}
                    className="min-h-11 rounded-xl px-4 font-label-md text-label-md font-semibold text-primary underline-offset-4 hover:bg-surface-container-low hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {showAllPreviewRows
                      ? "Afficher moins"
                      : `Afficher les ${preview.apercu.length} lignes`}
                  </button>
                </div>
              )}
              <div className="space-y-2 p-3 md:hidden">
                {preview.apercu.slice(0, showAllPreviewRows ? undefined : 10).map((row) => (
                  <article key={row.rowNumber} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-label-md text-label-md font-bold text-on-surface">{row.site}</p>
                      <span className="shrink-0 rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                        Ligne {row.rowNumber}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-on-surface-variant">
                      <span>{new Date(row.date).toLocaleDateString("fr-FR")}</span>
                      <span className="font-semibold text-on-surface">{row.quantite.toLocaleString("fr-FR")} {uniteApercu}</span>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-surface-container-low">
                      <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Ligne</th>
                      <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Site</th>
                      <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Date</th>
                      <th className="px-4 py-3 text-right font-label-md text-label-md uppercase text-on-surface-variant">Quantité ({uniteApercu})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.apercu.slice(0, showAllPreviewRows ? undefined : 10).map((row) => (
                      <tr key={row.rowNumber} className="border-b border-outline-variant/20">
                        <td className="px-4 py-2.5 font-label-sm text-label-sm text-on-surface-variant">{row.rowNumber}</td>
                        <td className="max-w-sm break-words px-4 py-2.5 font-label-md text-label-md font-bold text-on-surface">{row.site}</td>
                        <td className="px-4 py-2.5 font-body-md text-body-md text-on-surface-variant">
                          {new Date(row.date).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="px-4 py-2.5 text-right font-headline-sm text-headline-sm font-bold text-on-surface">
                          {row.quantite.toLocaleString("fr-FR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setResult(null);
                setError(null);
              }}
              className="rounded-xl bg-surface-container-high px-5 py-2.5 font-label-md text-label-md text-on-surface"
            >
              Choisir un autre fichier
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={importing || !clientId}
              className="min-h-11 flex items-center gap-2 justify-center rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">database_download</span>
              {importing ? "Import en cours..." : `Importer ${preview.totalRows} intervention(s)`}
            </button>
          </div>
        </div>
      )}

      {importing && (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="font-body-md text-body-md text-on-surface-variant">
            Import des interventions en cours...
          </span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-status-completed/30 bg-status-completed/5 p-6">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[32px] text-status-completed">check_circle</span>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Import terminé</h2>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-container-low p-3 text-center">
                    <p className="font-kpi-value text-kpi-value text-primary">{result.created}</p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Importées</p>
                  </div>
                  <div className="rounded-xl bg-surface-container-low p-3 text-center">
                    <p className="font-kpi-value text-kpi-value text-secondary">{result.duplicates}</p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Déjà existantes</p>
                  </div>
                  <div className="rounded-xl bg-surface-container-low p-3 text-center">
                    <p className="font-kpi-value text-kpi-value text-on-surface">
                      {result.summary.totalRows.toLocaleString("fr-FR")}
                    </p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Total fichier</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setResult(null);
                setError(null);
                setNatureIntervention("Collecte d'huiles usagées");
              }}
              className="rounded-xl bg-surface-container-high px-5 py-2.5 font-label-md text-label-md text-on-surface"
            >
              Importer un autre fichier
            </button>
            <Link
              href="/operations"
              className="flex items-center gap-2 justify-center rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary hover:bg-primary-container"
            >
              <span className="material-symbols-outlined text-[18px]">list</span>
              Voir la liste des interventions
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
