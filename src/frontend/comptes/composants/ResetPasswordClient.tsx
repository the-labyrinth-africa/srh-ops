"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatApiError } from "@/frontend/design-system";
import { validateNewPassword } from "@/shared/comptes/validators/password-form";

const GENERIC_ERROR = "Le service est momentanément indisponible. Réessayez dans quelques instants.";
const INVALID_LINK_MESSAGE = "Lien invalide ou expiré. Demandez un nouveau lien.";
const INVALID_LINK_CODE = "INVALID_LINK";

const INPUT_CLASS =
  "h-12 w-full rounded-DEFAULT border-none bg-surface-container-low pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary";

function NewLinkButton() {
  return (
    <Link
      href="/forgot-password"
      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
    >
      Demander un nouveau lien
    </Link>
  );
}

export function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      setTokenError(INVALID_LINK_MESSAGE);
      return;
    }

    let active = true;
    setVerifying(true);

    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && data.valid === true) {
          setTokenValid(true);
        } else {
          setTokenValid(false);
          if (data.code === INVALID_LINK_CODE) {
            setTokenError(INVALID_LINK_MESSAGE);
          } else {
            setTokenError(formatApiError(data.error, GENERIC_ERROR));
          }
        }
      })
      .catch(() => {
        if (active) {
          setTokenValid(false);
          setTokenError(GENERIC_ERROR);
        }
      })
      .finally(() => {
        if (active) setVerifying(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const validationError = validateNewPassword(password, confirmation);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setLoading(true);
    setFormError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccess(true);
      } else if (data.code === INVALID_LINK_CODE) {
        setTokenValid(false);
        setTokenError(INVALID_LINK_MESSAGE);
      } else {
        setFormError(formatApiError(data.error, GENERIC_ERROR));
      }
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-margin-mobile">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-8 shadow-xl">
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface">
          Réinitialisation du mot de passe
        </h1>

        {verifying ? (
          <p className="mt-4 font-body-md text-body-md text-on-surface-variant">
            Vérification du lien...
          </p>
        ) : tokenValid === false ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-error-container p-4 text-on-error-container font-body-md text-body-md">
              {tokenError}
            </div>
            <NewLinkButton />
          </div>
        ) : success ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-surface-container-low p-4 text-on-surface font-body-md text-body-md">
              Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.
            </div>
            <Link
              href="/login"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-label-md text-label-md font-semibold text-on-primary"
            >
              Se connecter
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {formError && (
              <div className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">
                {formError}
              </div>
            )}

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-3.5 text-[20px] text-on-surface-variant">
                  lock
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-3.5 text-[20px] text-on-surface-variant">
                  lock
                </span>
                <input
                  type="password"
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-primary font-label-md text-label-md font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-50"
            >
              {loading ? "Enregistrement..." : "Changer le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
