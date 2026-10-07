"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatApiError } from "@/frontend/design-system";
import { homePathFor } from "@/shared/acces/acces-pages";
import { roleLabel } from "@/shared/acces/permissions";

export function ProfilPageClient() {
  return (
    <Suspense fallback={null}>
      <ProfilContent />
    </Suspense>
  );
}

function ProfilContent() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forced = searchParams.get("forcer") === "1" || Boolean(session?.user?.mustChangePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [testMailLoading, setTestMailLoading] = useState(false);
  const [testMailFeedback, setTestMailFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccess("Mot de passe modifié avec succès.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        await update();
        if (forced) {
          router.push(homePathFor(session?.user?.role));
        }
      } else {
        setError(formatApiError(data.error));
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  async function handleTestEmail() {
    setTestMailLoading(true);
    setTestMailFeedback(null);
    try {
      const res = await fetch("/api/mail/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setTestMailFeedback({
          type: "success",
          text: `E-mail de test envoyé à ${data.to}. Vérifiez votre boîte de réception (et les courriers indésirables).`,
        });
      } else {
        setTestMailFeedback({
          type: "error",
          text: formatApiError(data.error, "L'envoi a échoué. Vérifiez la configuration SMTP."),
        });
      }
    } catch {
      setTestMailFeedback({ type: "error", text: "Erreur réseau lors de l'envoi de l'e-mail de test." });
    } finally {
      setTestMailLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-gutter-md p-margin-mobile lg:p-margin-desktop">
      <div>
        <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
          Mon Compte & Sécurité
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Gérez vos informations personnelles et votre mot de passe.
        </p>
      </div>

      {forced && (
        <div className="rounded-xl border border-warning/30 bg-surface-container-low p-4 text-on-surface">
          <p className="font-label-md text-label-md font-bold text-status-delayed">
            Changement de mot de passe obligatoire
          </p>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Vous utilisez un mot de passe temporaire. Veuillez le modifier avant de pouvoir accéder aux autres fonctionnalités.
          </p>
        </div>
      )}

      {/* Informations de profil */}
      <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md space-y-4">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Informations personnelles
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="block font-label-sm text-label-sm text-outline">Nom</span>
            <span className="font-body-md text-body-md font-semibold text-on-surface">
              {session?.user?.name || "—"}
            </span>
          </div>
          <div>
            <span className="block font-label-sm text-label-sm text-outline">Identifiant (Username)</span>
            <span className="font-body-md text-body-md font-mono text-primary font-semibold">
              @{session?.user?.username || "—"}
            </span>
          </div>
          <div>
            <span className="block font-label-sm text-label-sm text-outline">Adresse E-mail</span>
            <span className="font-body-md text-body-md text-on-surface">
              {session?.user?.email || "—"}
            </span>
          </div>
          <div>
            <span className="block font-label-sm text-label-sm text-outline">Rôle</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-bold text-on-surface">
              {roleLabel(session?.user?.role)}
            </span>
          </div>
        </div>
      </div>

      {/* Formulaire de changement de mot de passe */}
      <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md space-y-4">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Changer le mot de passe
        </h2>

        {error && (
          <div className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-surface-container-low p-3 text-sm text-status-reported font-bold">
            {success}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block font-label-md text-label-md text-on-surface mb-1">
              Mot de passe actuel *
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block font-label-md text-label-md text-on-surface mb-1">
              Nouveau mot de passe (au moins 6 caractères) *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block font-label-md text-label-md text-on-surface mb-1">
              Confirmer le nouveau mot de passe *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-10 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-primary px-5 font-label-md text-label-md font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Modifier le mot de passe"}
          </button>
        </form>
      </div>

      {/* Test E-mail SMTP (Admin seulement) */}
      {session?.user?.role === "admin" && (
        <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md space-y-4">
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
            Diagnostic E-mail (SMTP)
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Test de délivrabilité SMTP : envoie un e-mail de test à l&apos;adresse de votre compte (<strong>{session?.user?.email}</strong>).
          </p>

          {testMailFeedback && (
            <div
              className={`rounded-xl p-3 text-sm ${
                testMailFeedback.type === "success"
                  ? "bg-surface-container-low text-status-reported font-bold"
                  : "bg-error-container text-on-error-container"
              }`}
            >
              {testMailFeedback.text}
            </div>
          )}

          <button
            type="button"
            disabled={testMailLoading}
            onClick={handleTestEmail}
            className="flex items-center gap-2 h-11 rounded-xl border border-outline-variant bg-surface px-4 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">mail</span>
            {testMailLoading ? "Envoi en cours..." : "Envoyer un e-mail de test à mon adresse"}
          </button>
        </div>
      )}
    </div>
  );
}
