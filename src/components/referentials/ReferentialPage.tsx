"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { EntityModal } from "@/components/forms/EntityModal";
import { canWrite } from "@/lib/permissions";

interface Field {
  key: string;
  label: string;
  type?: "text" | "number" | "checkbox";
  required?: boolean;
  table?: boolean;
}

interface ReferentialPageProps {
  title: string;
  subtitle: string;
  icon: string;
  apiPath: string;
  fields: Field[];
  emptyForm: Record<string, string | boolean>;
}

export function ReferentialPage({
  title,
  subtitle,
  icon,
  apiPath,
  fields,
  emptyForm,
}: ReferentialPageProps) {
  const { data: session } = useSession();
  const canEdit = canWrite(session?.user?.role);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm);

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiPath);
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }, [apiPath]);

  useEffect(() => {
    load();
  }, [load]);

  const tableFields = fields.filter((f) => f.table !== false);
  const labelField = fields[0]?.key ?? "nom";

  const filtered = items.filter((item) =>
    String(item[labelField] ?? "")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(item: Record<string, unknown>) {
    setEditing(item);
    const next: Record<string, string | boolean> = { ...emptyForm };
    fields.forEach((f) => {
      if (f.key === "membres" && Array.isArray(item[f.key]))
        next[f.key] = (item[f.key] as string[]).join(", ");
      else
        next[f.key] = (item[f.key] as string | boolean) ?? (f.type === "checkbox" ? false : "");
    });
    setForm(next);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (f.type === "number") body[f.key] = Number(form[f.key]);
      else if (f.type === "checkbox") body[f.key] = form[f.key];
      else if (f.key === "membres")
        body[f.key] = String(form[f.key])
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      else body[f.key] = form[f.key];
    });

    const url = editing ? `${apiPath}/${editing._id}` : apiPath;
    const method = editing ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cet élément ?")) return;
    await fetch(`${apiPath}/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex h-full flex-col gap-margin-desktop p-margin-mobile lg:p-margin-desktop">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-2 flex items-center gap-3 font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            <span className={`material-symbols-outlined text-[32px] text-primary`}>{icon}</span>
            {title}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 self-start rounded-full bg-primary px-5 py-3 font-label-md text-label-md text-on-primary shadow-md"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Ajouter
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-surface-container p-6 shadow-sm sm:w-fit">
        <p className="mb-1 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Total</p>
        <p className="font-kpi-value text-kpi-value text-on-surface">{items.length}</p>
      </div>

      <div className="overflow-hidden rounded-3xl bg-surface-container shadow-sm">
        <div className="border-b border-outline-variant/30 bg-surface-container-low p-4">
          <div className="relative w-full sm:w-80">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">search</span>
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full bg-surface py-2.5 pl-12 pr-4 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-container-low/50">
                {tableFields.map((f) => (
                  <th key={f.key} className="px-4 py-3 text-left font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                    {f.label}
                  </th>
                ))}
                {canEdit && <th className="px-4 py-3 text-right font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={String(item._id)} className={i % 2 === 0 ? "bg-surface-container-lowest" : "bg-surface-container-low/30"}>
                  {tableFields.map((f) => (
                    <td key={f.key} className="px-4 py-4 font-body-md text-body-md text-on-surface">
                      {f.type === "checkbox"
                        ? item[f.key] ? "Disponible" : "Indisponible"
                        : String(item[f.key] ?? "—")}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => openEdit(item)} className="mr-2 text-secondary">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button type="button" onClick={() => remove(String(item._id))} className="text-error">
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

      <EntityModal open={open} title={editing ? "Modifier" : "Ajouter"} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="flex flex-col gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                {f.label}{f.required ? " *" : ""}
              </label>
              {f.type === "checkbox" ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(form[f.key])}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-body-md text-body-md">Disponible</span>
                </label>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  required={f.required}
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </div>
          ))}
          <button type="submit" className="h-12 rounded-xl bg-primary font-label-md text-label-md text-on-primary">
            Enregistrer
          </button>
        </form>
      </EntityModal>
    </div>
  );
}
