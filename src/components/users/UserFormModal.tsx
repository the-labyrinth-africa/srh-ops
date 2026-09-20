"use client";

import { useEffect, useState } from "react";
import { USER_ROLES } from "@/shared/acces/roles";
import { roleLabel } from "@/shared/acces/permissions";
import { formatApiError } from "@/lib/api-error";
import { TemporaryPasswordPanel } from "./TemporaryPasswordPanel";

interface Option {
  _id: string;
  nom?: string;
}

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    _id?: string;
    username?: string;
    nom?: string;
    email?: string;
    role?: string;
    telephone?: string;
    clientId?: string | { _id: string; nom: string };
    equipeId?: string | { _id: string; nom: string };
  } | null;
}

export function UserFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: UserFormModalProps) {
  const [clients, setClients] = useState<Option[]>([]);
  const [equipes, setEquipes] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedPasswordMessage, setGeneratedPasswordMessage] = useState("");
  // Mot de passe temporaire : uniquement en mémoire (état React), jamais persisté.
  const [generatedPassword, setGeneratedPassword] = useState("");

  const [form, setForm] = useState({
    username: "",
    nom: "",
    email: "",
    role: "dispatcher",
    telephone: "",
    clientId: "",
    equipeId: "",
  });

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        fetch("/api/clients").then((r) => r.json()),
        fetch("/api/equipes").then((r) => r.json()),
      ]).then(([c, e]) => {
        setClients(Array.isArray(c) ? c : []);
        setEquipes(Array.isArray(e) ? e : []);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      const clientId =
        initialData.clientId && typeof initialData.clientId === "object"
          ? (initialData.clientId as { _id: string })._id
          : initialData.clientId || "";

      const equipeId =
        initialData.equipeId && typeof initialData.equipeId === "object"
          ? (initialData.equipeId as { _id: string })._id
          : initialData.equipeId || "";

      setForm({
        username: initialData.username || "",
        nom: initialData.nom || "",
        email: initialData.email || "",
        role: initialData.role || "dispatcher",
        telephone: initialData.telephone || "",
        clientId,
        equipeId,
      });
    } else {
      setForm({
        username: "",
        nom: "",
        email: "",
        role: "dispatcher",
        telephone: "",
        clientId: "",
        equipeId: "",
      });
    }
    setError("");
    setGeneratedPasswordMessage("");
    setGeneratedPassword("");
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setGeneratedPasswordMessage("");
    setGeneratedPassword("");

    const isEdit = Boolean(initialData?._id);
    const url = isEdit ? `/api/users/${initialData!._id}` : "/api/users";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(formatApiError(data.error));
      return;
    }

    if (!isEdit && data.invitation === "sent") {
      // Invitation envoyée : aucun mot de passe n'est renvoyé, l'utilisateur le choisira via le lien.
      setGeneratedPasswordMessage(
        `Invitation envoyée à ${form.email.trim().toLowerCase()}. L'utilisateur choisira son mot de passe via le lien (valable 72 h).`
      );
      onSuccess();
    } else if (!isEdit && data.message) {
      // Repli : e-mail non envoyé, mot de passe temporaire à communiquer par l'administrateur.
      setGeneratedPasswordMessage(data.message);
      setGeneratedPassword(typeof data.generatedPassword === "string" ? data.generatedPassword : "");
      onSuccess();
    } else {
      onSuccess();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            {initialData?._id ? "Modifier l'utilisateur" : "Ajouter un utilisateur"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-surface-container-high">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-error-container p-3 font-body-md text-body-md text-on-error-container">
            {error}
          </div>
        )}

        {generatedPasswordMessage ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-status-completed/10 p-4 font-body-md text-body-md text-status-completed">
              {generatedPasswordMessage}
            </div>
            {generatedPassword && <TemporaryPasswordPanel password={generatedPassword} />}
            <button
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!initialData?._id && (
              <div>
                <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                  Nom d&apos;utilisateur (Username) *
                </label>
                <input
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="ex: p_kone"
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Nom complet *</label>
              <input
                required
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                placeholder="Ex: Pierre Koné"
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Adresse E-mail *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="pierre.kone@srh.ci"
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Rôle attribué *</label>
              <select
                value={form.role}
                onChange={(e) => {
                  const role = e.target.value;
                  setForm({
                    ...form,
                    role,
                    clientId: role === "client" ? form.clientId : "",
                    equipeId: role === "chauffeur" ? form.equipeId : "",
                  });
                }}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Téléphone</label>
              <input
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                placeholder="+225 07 00 00 00"
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {form.role === "client" && (
              <div>
                <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Client rattaché *</label>
                <select
                  required
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sélectionner un client...</option>
                  {clients.map((c) => (
                    <option key={c._id} value={c._id}>{c.nom}</option>
                  ))}
                </select>
              </div>
            )}

            {form.role === "chauffeur" && (
              <div>
                <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Équipe rattachée *</label>
                <select
                  required
                  value={form.equipeId}
                  onChange={(e) => setForm({ ...form, equipeId: e.target.value })}
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sélectionner une équipe...</option>
                  {equipes.map((e) => (
                    <option key={e._id} value={e._id}>{e.nom}</option>
                  ))}
                </select>
              </div>
            )}

            {!initialData?._id && (
              <p className="text-xs text-on-surface-variant italic">
                ℹ️ Une invitation sera envoyée par e-mail : l&apos;utilisateur choisira son mot de passe via le lien (valable 72 h). Si l&apos;e-mail ne peut pas partir, un mot de passe temporaire vous sera affiché une seule fois.
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-surface-container-high px-4 py-2.5 font-label-md text-label-md text-on-surface"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                {loading ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
