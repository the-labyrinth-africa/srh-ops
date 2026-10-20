import Link from "next/link";
import { roleLabel } from "@/shared/acces/permissions";
import type { UserRole } from "@/shared/acces/roles";
import { guideSectionsForRole } from "./contenu";

const STATUS_FLOW = [
  "Demande",
  "Planifiée",
  "Affectée",
  "En route",
  "En cours",
  "Terminée",
  "Rapportée",
];

export function GuideUtilisation({ role }: { role: UserRole }) {
  const sections = guideSectionsForRole(role);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-margin-mobile lg:p-margin-desktop">
      <header className="rounded-2xl bg-primary p-6 text-on-primary sm:p-8">
        <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-primary/80">
          Aide et prise en main
        </p>
        <h1 className="mt-2 font-headline-lg-mobile font-bold sm:font-headline-lg sm:text-headline-lg">
          Guide d&apos;utilisation
        </h1>
        <p className="mt-3 max-w-2xl font-body-md text-body-md text-on-primary/90">
          Les étapes ci-dessous correspondent à votre rôle. Utilisez la table des matières pour aller directement à une action.
        </p>
        <div className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-surface px-4 py-2 font-label-md text-label-md font-semibold text-on-surface">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">verified_user</span>
          Votre rôle : {roleLabel(role)}
        </div>
      </header>

      <section aria-labelledby="demarrer-title" className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 sm:p-6">
        <h2 id="demarrer-title" className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Avant de commencer
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          <li className="rounded-xl bg-surface-container-low p-4">
            <span className="font-label-sm text-label-sm font-bold text-primary">1 · Connexion</span>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Connectez-vous avec l&apos;identifiant et le mot de passe fournis par votre responsable.
            </p>
          </li>
          <li className="rounded-xl bg-surface-container-low p-4">
            <span className="font-label-sm text-label-sm font-bold text-primary">2 · Mot de passe</span>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Si la solution vous le demande, changez votre mot de passe depuis la page « Profil ».
            </p>
          </li>
          <li className="rounded-xl bg-surface-container-low p-4">
            <span className="font-label-sm text-label-sm font-bold text-primary">3 · Connexion Internet</span>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Gardez une connexion Internet pendant l&apos;utilisation. Les informations saisies hors connexion ne sont pas envoyées.
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="statuts-title" className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 sm:p-6">
        <h2 id="statuts-title" className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Comprendre les statuts
        </h2>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Le statut indique où en est l&apos;opération. Les étapes proposées dépendent de son statut actuel.
        </p>
        <ol className="mt-4 flex flex-wrap items-center gap-2" aria-label="Étapes habituelles d'une opération">
          {STATUS_FLOW.map((status, index) => (
            <li key={status} className="flex items-center gap-2">
              <span className="rounded-full bg-primary-container px-3 py-1.5 font-label-sm text-label-sm font-semibold text-on-surface">
                {status}
              </span>
              {index < STATUS_FLOW.length - 1 && (
                <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  arrow_forward
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
          « Retardée » et « Annulée » sont des statuts particuliers. Une demande client doit être vérifiée avant d&apos;être planifiée.
        </p>
      </section>

      <nav aria-label="Sommaire du guide" className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 sm:p-6">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Dans ce guide</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-outline-variant px-4 py-2 font-label-md text-label-md font-semibold text-primary underline-offset-4 transition-colors hover:bg-surface-container-low hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {section.roleLabel}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-title`}
          className="scroll-mt-24 space-y-5"
        >
          <header>
            <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">
              Guide · {section.roleLabel}
            </p>
            <h2 id={`${section.id}-title`} className="mt-1 font-headline-md text-headline-md font-bold text-on-surface">
              {section.title}
            </h2>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{section.description}</p>
          </header>

          <div className="grid gap-4">
            {section.topics.map((topic) => (
              <article key={topic.title} className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 sm:p-6">
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">{topic.title}</h3>
                <ol className="mt-4 space-y-3">
                  {topic.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 font-body-md text-body-md text-on-surface-variant">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-container font-label-sm text-label-sm font-bold text-on-surface">
                        {index + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                {topic.note && (
                  <p className="mt-4 rounded-lg border-l-4 border-primary bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface">
                    <span className="font-semibold">À retenir : </span>{topic.note}
                  </p>
                )}
                {topic.href && topic.linkLabel && (
                  <Link
                    href={topic.href}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg font-label-md text-label-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {topic.linkLabel}
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      <footer className="rounded-2xl bg-surface-container-low p-5 sm:p-6">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Besoin d&apos;aide ?</h2>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Si un menu ou une action n&apos;apparaît pas, votre rôle ne l&apos;autorise peut-être pas. Contactez l&apos;administrateur de la solution pour vérifier vos accès.
        </p>
      </footer>
    </div>
  );
}
