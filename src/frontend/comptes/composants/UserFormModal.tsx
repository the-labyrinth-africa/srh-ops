"use client";

import { useEffect, useState } from "react";
import { TENANT_ROLES } from "@/shared/acces/roles";
import { roleLabel } from "@/shared/acces/permissions";
import { formatApiError } from "@/frontend/design-system";
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

export function UserFormModal({ isOpen, onClose, onSuccess, initialData }: UserFormModalProps) {
  const isEditing = Boolean(initialData?._id);

  const [username, setUsername] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("lecture");
  const [telephone, setTelephone] = useState("");
  const [clientId, setClientId] = useState("");
  const [equipeId, setEquipeId] = useState("");

  const [clients, setClients] = useState<Option[]>([]);
  const [equipes, setEquipes] = useState<Option[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdResult, setCreatedResult] = useState<{ password?: string; invitationSent: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/clients")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setClients(Array.isArray(d) ? d : []));
      fetch("/api/equipes")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setEquipes(Array.isArray(d) ? d : []));
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      setUsername(initialData.username || "");
      setNom(initialData.nom || "");
      setEmail(initialData.email || "");
      setRole(initialData.role || "lecture");
      setTelephone(initialData.telephone || "");
      const cId = typeof initialData.clientId === "object" ? initialData.clientId?._id : initialData.clientId;
      const eqId = typeof initialData.equipeId === "object" ? initialData.equipeId?._id : initialData.equipeId;
      setClientId(cId || "");
      setEquipeId(eqId || "");
    } else {
      setUsername("");
      setNom("");
      setEmail("");
      setRole("lecture");
      setTelephone("");
      setClientId("");
      setEquipeId("");
    }
    setError("");
    setCreatedResult(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload: Record<string, unknown> = {
      username: username.trim(),
      nom: nom.trim(),
      email: email.trim(),
      role,
      telephone: telephone.trim() || undefined,
    };

    if (role === "client") payload.clientId = clientId || undefined;
    if (role === "chauffeur") payload.equipeId = equipeId || undefined;

    try {
      const url = isEditing ? `/api/users/${initialData?._id}` : "/api/users";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(formatApiError(data.error));
      } else {
        onSuccess();
        if (!isEditing && data.user) {
          const sent = data.invitation !== "not_sent";
          const pass =
            typeof data.temporaryPassword === "string"
              ? data.temporaryPassword
              : typeof data.generatedPassword === "string"
                ? data.generatedPassword
                : undefined;
          setCreatedResult({ password: pass, invitationSent: sent });
        } else {
          onClose();
        }
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-modal-title"
        className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-xl my-8"
      >
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <h2 id="user-modal-title" className="font-headline-sm text-headline-sm text-on-surface">
            {isEditing ? "Modifier l'utilisateur" : "Créer un nouvel utilisateur"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {createdResult ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-status-reported/30 bg-surface-container-low p-4 text-on-surface">
              <p className="font-label-md text-label-md font-bold text-status-reported">
                Compte créé avec succès !
              </p>
              {createdResult.invitationSent ? (
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                  Un e-mail d&apos;invitation contenant un lien d&apos;activation à usage unique (valable 72 h) a été envoyé à <strong>{email}</strong>.
                </p>
              ) : (
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                  L&apos;e-mail d&apos;invitation n&apos;a pas pu être envoyé (SMTP non configuré ou indisponible). Veuillez transmettre manuellement le mot de passe temporaire ci-dessous.
                </p>
              )}
            </div>

            {createdResult.password && (
              <TemporaryPasswordPanel password={createdResult.password} />
            )}

            <button
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">
                {error}
              </div>
            )}

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">
                Identifiant unique (username) *
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: jdupont"
                className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">Nom complet *</label>
              <input
                type="text"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="ex: Jean Dupont"
                className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">Adresse e-mail *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ex: j.dupont@entreprise.com"
                className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">Téléphone</label>
              <input
                type="text"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="ex: +225 07 00 00 00 00"
                className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">Rôle attribué *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
              >
                {TENANT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>

            {role === "client" && (
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">
                  Compte Client associé *
                </label>
                <select
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sélectionner un client...</option>
                  {clients.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {role === "chauffeur" && (
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">
                  Équipe attribuée *
                </label>
                <select
                  required
                  value={equipeId}
                  onChange={(e) => setEquipeId(e.target.value)}
                  className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sélectionner une équipe...</option>
                  {equipes.map((eq) => (
                    <option key={eq._id} value={eq._id}>
                      {eq.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-high"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="h-10 px-5 rounded-xl bg-primary font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
              >
                {loading ? "Enregistrement..." : isEditing ? "Enregistrer" : "Créer le compte"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
