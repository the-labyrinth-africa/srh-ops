"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const LOGO_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB1xOxGNUjWSBV2jk4DZt3xE-9Srw8jX7XbK5hgKOxsQTlamjCfm-2mAMvEtEnC-KLykmgDkBxuDs8c7o1SPBRM2AduE-2njQSsETOV73grhkotl4Uzs6tfUUzxjUgt8_U9tzeerdggWxLZKX5c8HM6tCM7yzpImj69LA89rUBoFAIQZ5M8I-MpD3rs0APTX2Rlew8DF4TksbmckxhcMoYgXyNxllMLBFolhd-Ki1ZlHvKfJu0rD7qu4qNJPBu79T5QHg";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Identifiants incorrects");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center p-margin-mobile lg:p-margin-desktop">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-20%] h-[60%] w-[60%] rounded-full bg-primary/5 blur-3xl mix-blend-multiply" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-secondary/5 blur-3xl mix-blend-multiply" />
      </div>

      <div className="group relative z-10 w-full max-w-md overflow-hidden rounded-xl bg-surface-container-lowest p-8 shadow-xl lg:p-12">
        <div className="absolute left-0 top-0 h-1 w-full origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" />

        <div className="mb-8 flex flex-col items-center">
          <Image
            src={LOGO_URL}
            alt="SRH Logo"
            width={120}
            height={48}
            className="mb-6 h-12 w-auto object-contain"
          />
          <h1 className="text-center font-headline-md text-headline-md tracking-tight text-on-surface">
            Connexion à votre espace
          </h1>
          <p className="mt-2 max-w-[80%] text-center font-body-md text-body-md text-on-surface-variant">
            Accédez à l&apos;interface opérationnelle sécurisée.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {error && (
            <div className="rounded-DEFAULT bg-error-container px-4 py-3 font-body-md text-body-md text-on-error-container">
              {error}
            </div>
          )}

          <div className="relative flex flex-col gap-1">
            <label htmlFor="email" className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface">
              Adresse Email
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 text-on-surface-variant/50">
                mail
              </span>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="identifiant@srh.com"
                className="h-12 w-full rounded-DEFAULT border-none bg-surface-container-low pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="relative flex flex-col gap-1">
            <div className="flex w-full items-center justify-between">
              <label htmlFor="password" className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface">
                Mot de passe
              </label>
            </div>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 text-on-surface-variant/50">
                lock
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 w-full rounded-DEFAULT border-none bg-surface-container-low pl-10 pr-10 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-on-surface-variant/50 transition-colors hover:text-on-surface"
              >
                <span className="material-symbols-outlined">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group/btn relative mt-2 flex h-12 w-full items-center justify-center overflow-hidden rounded-DEFAULT bg-primary font-label-md text-label-md text-on-primary shadow-sm transition-all hover:bg-surface-tint hover:shadow-md active:scale-[0.98] disabled:opacity-70"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            ) : (
              <span className="relative z-10 flex items-center gap-2">
                Se connecter
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </span>
            )}
          </button>
        </form>

        <div className="mt-8 flex items-center justify-center gap-2 border-t border-surface-variant pt-6 text-on-surface-variant/60">
          <span className="material-symbols-outlined text-[16px]">verified_user</span>
          <span className="font-label-sm text-label-sm">Connexion chiffrée de bout en bout</span>
        </div>
      </div>

      <div className="absolute bottom-margin-mobile text-center font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant/40 lg:bottom-margin-desktop">
        © 2024 SRH Platform
      </div>
    </main>
  );
}
