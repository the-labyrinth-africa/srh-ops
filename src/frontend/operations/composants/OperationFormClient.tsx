"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatApiError } from "@/frontend/design-system";

interface Option {
  _id: string;
  nom?: string;
  identification?: string;
}

export function OperationFormClient() {
  const router = useRouter();
  const [clients, setClients] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [equipes, setEquipes] = useState<Option[]>([]);
  const [vehicules, setVehicules] = useState<Option[]>([]);
  const [equipements, setEquipements] = useState<Option[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    clientId: "",
    siteId: "",
    natureIntervention: "",
    dateHeurePrevue: "",
    dureeEstimeeMinutes: "120",
    equipeId: "",
    vehiculeId: "",
    equipementIds: [] as string[],
    informationsParticulieres: "",
  });

  useEffect(() => {
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : []))
      .then(setClients);
    fetch("/api/equipes")
      .then((res) => (res.ok ? res.json() : []))
      .then(setEquipes);
    fetch("/api/vehicules")
      .then((res) => (res.ok ? res.json() : []))
      .then(setVehicules);
    fetch("/api/equipements")
      .then((res) => (res.ok ? res.json() : []))
      .then(setEquipements);
  }, []);

  const handleClientChange = (clientId: string) => {
    setForm((prev) => ({ ...prev, clientId, siteId: "" }));
    if (clientId) {
      fetch(`/api/sites?clientId=${clientId}`)
        .then((res) => (res.ok ? res.json() : []))
        .then(setSites);
    } else {
      setSites([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        ...form,
        dureeEstimeeMinutes: Number(form.dureeEstimeeMinutes) || 120,
        equipeId: form.equipeId || undefined,
        vehiculeId: form.vehiculeId || undefined,
        dateHeurePrevue: form.dateHeurePrevue
          ? new Date(form.dateHeurePrevue).toISOString()
          : "",
      };

      const res = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(formatApiError(data.error));
        return;
      }

      router.push("/operations");
    } catch {
      setError("Erreur réseau lors de la création.");
    } finally {
      setLoading(false);
    }
  };

  const toggleEquipement = (id: string) => {
    setForm((prev) => ({
      ...prev,
      equipementIds: prev.equipementIds.includes(id)
        ? prev.equipementIds.filter((item) => item !== id)
        : [...prev.equipementIds, id],
    }));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-gutter-md p-margin-mobile lg:p-margin-desktop">
      <div className="flex items-center gap-3">
        <Link
          href="/operations"
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
            Nouvelle Opération
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Planification d&apos;une intervention de collecte.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container p-gutter-sm text-on-error-container">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block font-label-md text-label-md font-semibold text-on-surface">
              Client *
            </label>
            <select
              required
              value={form.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
            >
              <option value="">Sélectionner un client</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-label-md text-label-md font-semibold text-on-surface">
              Site d&apos;intervention *
            </label>
            <select
              required
              disabled={!form.clientId}
              value={form.siteId}
              onChange={(e) => setForm({ ...form, siteId: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none disabled:opacity-50"
            >
              <option value="">Sélectionner un site</option>
              {sites.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block font-label-md text-label-md font-semibold text-on-surface">
            Nature de l&apos;intervention *
          </label>
          <input
            type="text"
            required
            placeholder="Ex: Collecte d'huiles usagées, Vidange cuve..."
            value={form.natureIntervention}
            onChange={(e) => setForm({ ...form, natureIntervention: e.target.value })}
            className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block font-label-md text-label-md font-semibold text-on-surface">
              Date & heure prévues *
            </label>
            <input
              type="datetime-local"
              required
              value={form.dateHeurePrevue}
              onChange={(e) => setForm({ ...form, dateHeurePrevue: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
            />
          </div>

          <div>
            <label className="block font-label-md text-label-md font-semibold text-on-surface">
              Durée estimée (minutes)
            </label>
            <input
              type="number"
              min="15"
              step="15"
              value={form.dureeEstimeeMinutes}
              onChange={(e) => setForm({ ...form, dureeEstimeeMinutes: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block font-label-md text-label-md font-semibold text-on-surface">
              Équipe affectée
            </label>
            <select
              value={form.equipeId}
              onChange={(e) => setForm({ ...form, equipeId: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
            >
              <option value="">Aucune (Non affectée)</option>
              {equipes.map((eq) => (
                <option key={eq._id} value={eq._id}>
                  {eq.nom}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-label-md text-label-md font-semibold text-on-surface">
              Véhicule affecté
            </label>
            <select
              value={form.vehiculeId}
              onChange={(e) => setForm({ ...form, vehiculeId: e.target.value })}
              className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
            >
              <option value="">Aucun (Non affecté)</option>
              {vehicules.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.identification}
                </option>
              ))}
            </select>
          </div>
        </div>

        {equipements.length > 0 && (
          <div>
            <label className="block font-label-md text-label-md font-semibold text-on-surface">
              Équipements requis
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {equipements.map((eq) => {
                const selected = form.equipementIds.includes(eq._id);
                return (
                  <button
                    type="button"
                    key={eq._id}
                    onClick={() => toggleEquipement(eq._id)}
                    className={`rounded-xl border px-3 py-1.5 font-label-md text-label-md transition-all ${
                      selected
                        ? "border-primary bg-primary-container font-bold text-on-primary"
                        : "border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {eq.nom}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block font-label-md text-label-md font-semibold text-on-surface">
            Informations particulières / Consignes
          </label>
          <textarea
            rows={3}
            placeholder="Code d'accès, précautions particulières..."
            value={form.informationsParticulieres}
            onChange={(e) => setForm({ ...form, informationsParticulieres: e.target.value })}
            className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Link
            href="/operations"
            className="rounded-xl border border-outline-variant px-4 py-2.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md font-semibold text-on-primary shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Création..." : "Créer l'opération"}
          </button>
        </div>
      </form>
    </div>
  );
}
