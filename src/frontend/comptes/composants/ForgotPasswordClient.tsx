"use client";

import Link from "next/link";
import { useState } from "react";
import { formatApiError } from "@/frontend/design-system";

const GENERIC_ERROR = "Le service est momentanément indisponible. Réessayez dans quelques instants.";

export function ForgotPasswordClient() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setConfirmation(
          typeof data.message === "string"
            ? data.message
            : "Si cet identifiant correspond à un compte actif, un e-mail contenant un lien de réinitialisation vient de lui être envoyé."
        );
      } else {
        setError(formatApiError(data.error, GENERIC_ERROR));
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-margin-mobile">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-8 shadow-xl">
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface">
          Mot de passe oublié
        </h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Saisissez votre identifiant (username) ou votre adresse e-mail pour recevoir un lien de réinitialisation.
        </p>

        {confirmation ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-surface-container-low p-4 text-on-surface font-body-md text-body-md">
              {confirmation}
            </div>
            <Link
              href="/login"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-label-md text-label-md font-semibold text-on-primary"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">
                {error}
              </div>
            )}
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">
                Identifiant ou e-mail
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="ex: jdupont ou j.dupont@entreprise.com"
                className="h-12 w-full rounded-xl bg-surface-container-low px-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-primary font-label-md text-label-md font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-50"
            >
              {loading ? "Envoi..." : "Envoyer le lien"}
            </button>

            <div className="text-center pt-2">
              <Link href="/login" className="font-label-md text-label-md text-primary hover:underline">
                Se connecter
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
