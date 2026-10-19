import Link from "next/link";

export const metadata = {
  title: "Hors-ligne — SRH Ops",
  description: "Mode hors-ligne de la plateforme SRH Ops",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-margin-mobile text-center">
      <div className="mx-auto max-w-md rounded-2xl border border-surface-container-high bg-surface-container-lowest p-gutter-lg shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
          <span className="material-symbols-outlined text-[36px]">cloud_off</span>
        </div>
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Mode Hors-Ligne
        </h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Vous n&apos;avez actuellement aucune connexion Internet. Les actions saisies sur le terrain
          (statuts, photos, signatures) sont conservées en sécurité dans votre appareil et seront
          automatiquement synchronisées dès le retour du réseau.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/terrain"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-label-md text-label-md font-bold text-on-primary hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[20px]">local_shipping</span>
            Ouvrir la Console Terrain
          </Link>
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-2.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Réessayer de charger l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
