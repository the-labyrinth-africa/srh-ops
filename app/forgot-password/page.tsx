"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const LOGO_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB1xOxGNUjWSBV2jk4DZt3xE-9Srw8jX7XbK5hgKOxsQTlamjCfm-2mAMvEtEnC-KLykmgDkBxuDs8c7o1SPBRM2AduE-2njQSsETOV73grhkotl4Uzs6tfUUzxjUgt8_U9tzeerdggWxLZKX5c8HM6tCM7yzpImj69LA89rUBoFAIQZ5M8I-MpD3rs0APTX2Rlew8DF4TksbmckxhcMoYgXyNxllMLBFolhd-Ki1ZlHvKfJu0rD7qu4qNJPBu79T5QHg";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [debugPassword, setDebugPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setDebugPassword("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error?.message ?? data.error ?? "Une erreur est survenue");
        return;
      }

      setMessage(data.message);
      if (data.debugPassword) {
        setDebugPassword(data.debugPassword);
      }
    } catch (err) {
      setLoading(false);
      setError("Erreur de connexion au serveur");
      console.error(err);
    }
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center p-margin-mobile lg:p-margin-desktop">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-20%] h-[60%] w-[60%] rounded-full bg-primary/5 blur-3xl mix-blend-multiply" />
      </div>

      <div className="group relative z-10 w-full max-w-md overflow-hidden rounded-xl bg-surface-container-lowest p-8 shadow-xl lg:p-12">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src={LOGO_URL}
            alt="SRH Logo"
            width={120}
            height={48}
            className="mb-6 h-12 w-auto object-contain"
          />
          <h1 className="text-center font-headline-md text-headline-md tracking-tight text-on-surface">
            Mot de passe oublié
          </h1>
          <p className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
            Saisissez votre nom d&apos;utilisateur ou votre e-mail pour recevoir un mot de passe temporaire.
          </p>
        </div>

        {message ? (
          <div className="flex flex-col gap-4 text-center">
            <div className="rounded-xl bg-status-completed/10 p-4 font-body-md text-body-md text-status-completed font-medium">
              {message}
            </div>
            {debugPassword && (
              <div className="rounded-xl bg-surface-container-high p-4 text-left font-mono text-sm text-on-surface">
                <strong>(Mode Dev) Mot de passe généré :</strong> {debugPassword}
              </div>
            )}
            <Link
              href="/login"
              className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
            >
              Retour à la page de connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {error && (
              <div className="rounded-DEFAULT bg-error-container px-4 py-3 font-body-md text-body-md text-on-error-container">
                {error}
              </div>
            )}

            <div className="relative flex flex-col gap-1">
              <label htmlFor="identifier" className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface">
                Nom d&apos;utilisateur ou Email
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 text-on-surface-variant/50">
                  person
                </span>
                <input
                  id="identifier"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username ou email@srh.com"
                  className="h-12 w-full rounded-DEFAULT border-none bg-surface-container-low pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-DEFAULT bg-primary font-label-md text-label-md text-on-primary shadow-sm hover:bg-surface-tint disabled:opacity-70"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                  Générer & envoyer le mot de passe
                </>
              )}
            </button>

            <div className="text-center">
              <Link href="/login" className="font-label-md text-label-md text-on-surface-variant hover:text-primary">
                ← Retour à la connexion
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
