"use client";

import { useState, type FormEvent } from "react";

export function ExportOperations({
  dateDebutInitiale,
  dateFinInitiale,
}: {
  dateDebutInitiale: string;
  dateFinInitiale: string;
}) {
  const [dateDebut, setDateDebut] = useState(dateDebutInitiale);
  const [dateFin, setDateFin] = useState(dateFinInitiale);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function exporter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      const params = new URLSearchParams({ dateDebut, dateFin });
      const response = await fetch(`/api/dashboard/export?${params.toString()}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("text/csv")) {
        const body: unknown = contentType.includes("application/json") ? await response.json() : null;
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : response.redirected
              ? "Votre session a expiré. Reconnectez-vous puis relancez l’export."
              : "L’export n’a pas pu être généré.";
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `operations-${dateDebut}-${dateFin}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "L’export n’a pas pu être généré.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={exporter} className="flex flex-wrap items-end gap-3" aria-label="Exporter les opérations">
      <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
        Du
        <input
          type="date"
          value={dateDebut}
          max={dateFin}
          required
          onChange={(event) => setDateDebut(event.target.value)}
          className="min-h-11 rounded-lg border border-outline-variant bg-surface px-3 text-on-surface"
        />
      </label>
      <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
        Au
        <input
          type="date"
          value={dateFin}
          min={dateDebut}
          required
          onChange={(event) => setDateFin(event.target.value)}
          className="min-h-11 rounded-lg border border-outline-variant bg-surface px-3 text-on-surface"
        />
      </label>
      <button
        type="submit"
        disabled={enCours || !dateDebut || !dateFin}
        aria-busy={enCours}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-label-md text-label-md text-on-primary transition-colors hover:bg-surface-tint disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{enCours ? "progress_activity" : "download"}</span>
        {enCours ? "Préparation…" : "Exporter CSV"}
      </button>
      {erreur ? <p role="alert" className="basis-full text-sm text-status-delayed">{erreur}</p> : null}
      {!erreur && enCours ? <p role="status" className="sr-only">Préparation de l’export CSV.</p> : null}
    </form>
  );
}
