"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { canWrite } from "@/shared/acces/permissions";

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
  const canImport = canWrite(session?.user?.role);
  const [dragOver, setDragOver] = useState(false);
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

  // Le client destinataire est obligatoire : l'import ne fabrique plus de client.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setClients(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
        setError(data.error || "Erreur lors de l'analyse du fichier.");
        return;
      }
      setPreview(data.summary);
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
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
          Import des interventions sur site
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Importez un fichier Excel (SITES, DATES, QTES) pour alimenter la base d&apos;interventions.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-error/20 bg-error-container/20 p-4">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[20px] text-error">error</span>
            <div className="font-body-md text-body-md text-on-error-container">{error}</div>
          </div>
        </div>
      )}

      {!file ? (
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
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition-all ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-outline-variant bg-surface-container-lowest hover:border-primary/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <span className="material-symbols-outlined text-[28px]">upload_file</span>
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            Glissez votre fichier Excel ici
          </h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            ou cliquez pour sélectionner un fichier .xlsx (5 Mo maximum)
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 font-label-sm text-label-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">table_chart</span>
            Format attendu : colonnes « SITES », « DATES », « QTES »
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                <span className="material-symbols-outlined">table_chart</span>
              </div>
              <div>
                <p className="font-label-md text-label-md font-bold text-on-surface">{file.name}</p>
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
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
            <label className="font-label-md text-label-md text-on-surface-variant">
              Nature de l&apos;intervention (appliquée à toutes les lignes importées)
            </label>
            <input
              type="text"
              value={natureIntervention}
              onChange={(e) => setNatureIntervention(e.target.value)}
              className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </>
      )}

      {loading && (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="font-body-md text-body-md text-on-surface-variant">
            Analyse du fichier en cours...
          </span>
        </div>
      )}

      {preview && !loading && !result && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-surface-container-lowest p-4 text-center border">
              <p className="font-kpi-value text-kpi-value text-primary">{preview.totalRows}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Lignes détectées</p>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest p-4 text-center border">
              <p className="font-kpi-value text-kpi-value text-primary">{preview.uniqueSites}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Sites</p>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest p-4 text-center border">
              <p className="font-kpi-value text-kpi-value text-primary">
                {preview.totalQuantite.toLocaleString("fr-FR")}
              </p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Litres</p>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest p-4 text-center border">
              <p className="font-kpi-value text-kpi-value text-primary">
                {new Date(preview.dateMin).toLocaleDateString("fr-FR")}
                {" → "}
                {new Date(preview.dateMax).toLocaleDateString("fr-FR")}
              </p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Période</p>
            </div>
          </div>

          {preview.skippedRows > 0 && (
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {preview.skippedRows} ligne(s) ignorée(s)
              {preview.errors.length > 0 && ` (${preview.errors.length} erreur(s))`}
            </p>
          )}

          {preview.apercu.length > 0 && (
            <div className="overflow-hidden rounded-2xl bg-surface-container shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-surface-container-low">
                      <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Ligne</th>
                      <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Site</th>
                      <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Date</th>
                      <th className="px-4 py-3 text-right font-label-md text-label-md uppercase text-on-surface-variant">Quantité (L)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.apercu.map((row) => (
                      <tr key={row.rowNumber} className="border-b border-outline-variant/20">
                        <td className="px-4 py-2.5 font-label-sm text-label-sm text-on-surface-variant">{row.rowNumber}</td>
                        <td className="px-4 py-2.5 font-label-md text-label-md font-bold text-on-surface">{row.site}</td>
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
              {preview.totalRows > 10 && (
                <p className="px-4 py-2 font-label-sm text-label-sm text-on-surface-variant text-center">
                  … et {preview.totalRows - 10} autres lignes
                </p>
              )}
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
              className="flex items-center gap-2 justify-center rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
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