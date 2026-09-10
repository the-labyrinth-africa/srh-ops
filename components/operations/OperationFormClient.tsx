"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
    Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/equipes").then((r) => r.json()),
      fetch("/api/vehicules").then((r) => r.json()),
      fetch("/api/equipements").then((r) => r.json()),
    ]).then(([c, e, v, eq]) => {
      setClients(c);
      setEquipes(e);
      setVehicules(v);
      setEquipements(eq);
    });
  }, []);

  useEffect(() => {
    if (!form.clientId) {
      setSites([]);
      return;
    }
    fetch(`/api/sites?clientId=${form.clientId}`)
      .then((r) => r.json())
      .then(setSites);
  }, [form.clientId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error?.message ?? data.error ?? "Erreur lors de la création");
      if (data.conflicts) setError(data.conflicts.map((c: { message: string }) => c.message).join(", "));
      return;
    }

    router.push(`/operations/${data._id}`);
  }

  return (
    <div className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <nav className="mb-1 flex items-center gap-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
            <Link href="/operations" className="hover:text-primary">Opérations</Link>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="font-bold text-primary">Nouvelle collecte</span>
          </nav>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Planifier une nouvelle collecte
          </h1>
          <p className="mt-1 max-w-3xl font-body-md text-body-md text-on-surface-variant">
            Définition des paramètres de l&apos;intervention et affectation prévisionnelle des ressources.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/operations" className="flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2.5 font-label-md text-label-md text-on-surface">
            <span className="material-symbols-outlined text-[18px]">close</span>
            Annuler
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container px-4 py-3 font-body-md text-body-md text-on-error-container">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-gutter-md lg:grid-cols-12">
        <div className="flex flex-col gap-gutter-md lg:col-span-8">
          <section className="flex flex-col gap-5 rounded-xl bg-surface-container-lowest p-gutter-md shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high font-label-md text-label-md font-bold text-primary">01</div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Informations du Site & Client</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant">
                  Client émetteur <span className="text-status-action-req">*</span>
                </label>
                <select
                  required
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value, siteId: "" })}
                  className="h-11 w-full cursor-pointer appearance-none rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sélectionner...</option>
                  {clients.map((c) => (
                    <option key={c._id} value={c._id}>{c.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant">
                  Site d&apos;intervention <span className="text-status-action-req">*</span>
                </label>
                <select
                  required
                  value={form.siteId}
                  onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                  disabled={!form.clientId}
                  className="h-11 w-full cursor-pointer appearance-none rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">Sélectionner...</option>
                  {sites.map((s) => (
                    <option key={s._id} value={s._id}>{s.nom}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-5 rounded-xl bg-surface-container-lowest p-gutter-md shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high font-label-md text-label-md font-bold text-primary">02</div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Détails de l&apos;intervention</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 font-label-md text-label-md text-on-surface-variant">Nature de l&apos;intervention *</label>
                <input
                  required
                  value={form.natureIntervention}
                  onChange={(e) => setForm({ ...form, natureIntervention: e.target.value })}
                  placeholder="Ex: Pompage résidus noirs"
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 font-label-md text-label-md text-on-surface-variant">Date & heure prévues *</label>
                <input
                  required
                  type="datetime-local"
                  value={form.dateHeurePrevue}
                  onChange={(e) => setForm({ ...form, dateHeurePrevue: e.target.value })}
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 font-label-md text-label-md text-on-surface-variant">Durée estimée (min)</label>
                <input
                  type="number"
                  min={30}
                  value={form.dureeEstimeeMinutes}
                  onChange={(e) => setForm({ ...form, dureeEstimeeMinutes: e.target.value })}
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3.5 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 font-label-md text-label-md text-on-surface-variant">Informations particulières</label>
                <textarea
                  rows={3}
                  value={form.informationsParticulieres}
                  onChange={(e) => setForm({ ...form, informationsParticulieres: e.target.value })}
                  className="w-full rounded-xl bg-surface-container-low px-3.5 py-2 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-gutter-md lg:col-span-4">
          <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-gutter-md shadow-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Affectation ressources</h2>
            <div>
              <label className="mb-1.5 font-label-md text-label-md text-on-surface-variant">Équipe</label>
              <select
                value={form.equipeId}
                onChange={(e) => setForm({ ...form, equipeId: e.target.value })}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Non affectée</option>
                {equipes.map((e) => (
                  <option key={e._id} value={e._id}>{e.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 font-label-md text-label-md text-on-surface-variant">Véhicule</label>
              <select
                value={form.vehiculeId}
                onChange={(e) => setForm({ ...form, vehiculeId: e.target.value })}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Non affecté</option>
                {vehicules.map((v) => (
                  <option key={v._id} value={v._id}>{v.identification}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 font-label-md text-label-md text-on-surface-variant">Équipements</label>
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                {equipements.map((eq) => (
                  <label key={eq._id} className="flex items-center gap-2 font-body-md text-body-md">
                    <input
                      type="checkbox"
                      checked={form.equipementIds.includes(eq._id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...form.equipementIds, eq._id]
                          : form.equipementIds.filter((id) => id !== eq._id);
                        setForm({ ...form, equipementIds: ids });
                      }}
                      className="accent-primary"
                    />
                    {eq.nom}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-label-md text-label-md text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-70"
            >
              <span className="material-symbols-outlined text-[18px]">event_available</span>
              {loading ? "Planification..." : "Planifier & Confirmer"}
            </button>
          </section>
        </div>
      </form>
    </div>
  );
}
