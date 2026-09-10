"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { EntityModal } from "@/components/forms/EntityModal";
import { canWrite } from "@/lib/permissions";

interface Client {
  _id: string;
  nom: string;
  contact: { telephone: string; email: string };
}

interface Site {
  _id: string;
  clientId: string | { _id: string; nom: string };
  nom: string;
  adresse: string;
  typeDechets: string[];
}

export function ClientsPageClient() {
  const { data: session } = useSession();
  const canEdit = canWrite(session?.user?.role);

  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"client" | "site" | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState({
    nom: "",
    telephone: "",
    email: "",
    siteNom: "",
    siteAdresse: "",
    siteClientId: "",
    typeDechets: "",
  });

  const load = useCallback(async () => {
    const [cRes, sRes] = await Promise.all([
      fetch("/api/clients"),
      fetch("/api/sites"),
    ]);
    setClients(await cRes.json());
    setSites(await sRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = clients.filter((c) =>
    c.nom.toLowerCase().includes(search.toLowerCase())
  );

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      nom: form.nom,
      contact: { telephone: form.telephone, email: form.email },
    };
    const url = editingClient ? `/api/clients/${editingClient._id}` : "/api/clients";
    const method = editingClient ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setModal(null);
    setEditingClient(null);
    setForm({ nom: "", telephone: "", email: "", siteNom: "", siteAdresse: "", siteClientId: "", typeDechets: "" });
    load();
  }

  async function saveSite(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: form.siteClientId,
        nom: form.siteNom,
        adresse: form.siteAdresse,
        typeDechets: form.typeDechets ? form.typeDechets.split(",").map((s) => s.trim()) : [],
      }),
    });
    setModal(null);
    setForm({ nom: "", telephone: "", email: "", siteNom: "", siteAdresse: "", siteClientId: "", typeDechets: "" });
    load();
  }

  async function deleteClient(id: string) {
    if (!confirm("Supprimer ce client ?")) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    load();
  }

  function openEditClient(client: Client) {
    setEditingClient(client);
    setForm({
      nom: client.nom,
      telephone: client.contact.telephone,
      email: client.contact.email,
      siteNom: "",
      siteAdresse: "",
      siteClientId: client._id,
      typeDechets: "",
    });
    setModal("client");
  }

  const clientSites = (clientId: string) =>
    sites.filter((s) => {
      const cid = typeof s.clientId === "object" ? s.clientId._id : s.clientId;
      return cid === clientId;
    });

  return (
    <div className="flex h-full flex-col gap-margin-desktop p-margin-mobile lg:p-margin-desktop">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-2 font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Annuaire Clients
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Gestion centralisée des entreprises partenaires et de leurs sites d&apos;intervention.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setEditingClient(null);
                setForm({ nom: "", telephone: "", email: "", siteNom: "", siteAdresse: "", siteClientId: "", typeDechets: "" });
                setModal("site");
              }}
              className="flex items-center gap-2 rounded-full bg-surface-container px-5 py-3 font-label-md text-label-md text-on-surface-variant shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">add_location</span>
              Nouveau Site
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingClient(null);
                setForm({ nom: "", telephone: "", email: "", siteNom: "", siteAdresse: "", siteClientId: "", typeDechets: "" });
                setModal("client");
              }}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-label-md text-label-md text-on-primary shadow-md transition-shadow hover:shadow-xl"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              Nouveau Client
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-surface-container p-6 shadow-sm">
          <span className="material-symbols-outlined mb-4 text-[28px] text-primary">domain</span>
          <p className="mb-1 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Total Clients</p>
          <p className="font-kpi-value text-kpi-value text-on-surface">{clients.length}</p>
        </div>
        <div className="rounded-2xl bg-surface-container p-6 shadow-sm">
          <span className="material-symbols-outlined mb-4 text-[28px] text-secondary">factory</span>
          <p className="mb-1 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Sites Actifs</p>
          <p className="font-kpi-value text-kpi-value text-on-surface">{sites.length}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-3xl bg-surface-container shadow-sm">
        <div className="flex flex-col gap-3 border-b border-outline-variant/30 bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-80">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
              search
            </span>
            <input
              type="text"
              placeholder="Rechercher un client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full bg-surface py-2.5 pl-12 pr-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-container-low/50">
                <th className="px-4 py-3 text-left font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Client</th>
                <th className="px-4 py-3 text-left font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Contact</th>
                <th className="px-4 py-3 text-left font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Sites</th>
                {canEdit && <th className="px-4 py-3 text-right font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((client, i) => (
                <tr key={client._id} className={i % 2 === 0 ? "bg-surface-container-lowest" : "bg-surface-container-low/30"}>
                  <td className="px-4 py-4 font-label-md text-label-md text-on-surface">{client.nom}</td>
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                    {client.contact.email || client.contact.telephone || "—"}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {clientSites(client._id).map((s) => (
                        <span key={s._id} className="rounded-full bg-secondary-container/30 px-2 py-0.5 font-label-sm text-label-sm text-on-secondary-container">
                          {s.nom}
                        </span>
                      ))}
                      {clientSites(client._id).length === 0 && (
                        <span className="font-body-md text-body-md text-on-surface-variant/50">Aucun site</span>
                      )}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => openEditClient(client)} className="mr-2 text-secondary hover:text-primary">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button type="button" onClick={() => deleteClient(client._id)} className="text-error hover:text-on-error-container">
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <EntityModal open={modal === "client"} title={editingClient ? "Modifier le client" : "Nouveau client"} onClose={() => setModal(null)}>
        <form onSubmit={saveClient} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Nom *</label>
            <input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Téléphone</label>
            <input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <button type="submit" className="h-12 rounded-xl bg-primary font-label-md text-label-md text-on-primary">Enregistrer</button>
        </form>
      </EntityModal>

      <EntityModal open={modal === "site"} title="Nouveau site" onClose={() => setModal(null)}>
        <form onSubmit={saveSite} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Client *</label>
            <select required value={form.siteClientId} onChange={(e) => setForm({ ...form, siteClientId: e.target.value })} className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary">
              <option value="">Sélectionner...</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>{c.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Nom du site *</label>
            <input required value={form.siteNom} onChange={(e) => setForm({ ...form, siteNom: e.target.value })} className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Adresse</label>
            <input value={form.siteAdresse} onChange={(e) => setForm({ ...form, siteAdresse: e.target.value })} className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Types de déchets (séparés par virgule)</label>
            <input value={form.typeDechets} onChange={(e) => setForm({ ...form, typeDechets: e.target.value })} className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <button type="submit" className="h-12 rounded-xl bg-primary font-label-md text-label-md text-on-primary">Enregistrer</button>
        </form>
      </EntityModal>
    </div>
  );
}
