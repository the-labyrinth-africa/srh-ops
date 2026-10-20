import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-outline-variant/30 bg-surface-container-lowest">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center gap-3 px-margin-mobile py-5 text-center lg:px-margin-desktop">
        <p className="max-w-full break-words font-body-sm text-body-sm leading-6 text-on-surface-variant">
          <strong className="font-bold text-on-surface">WOM</strong>
          {" — solution détenue et éditée par "}
          <strong className="font-bold text-on-surface">The Labyrinth</strong>
          .
        </p>
        <a
          href="https://www.thelabyrinth.africa"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visiter le site web de The Labyrinth (nouvel onglet)"
          className="inline-flex min-h-11 max-w-full items-center gap-3 rounded-lg px-2 font-label-sm text-label-sm font-semibold text-on-surface-variant underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Image
            src="/logo-noir.png"
            alt=""
            width={36}
            height={39}
            className="h-9 w-9 object-contain"
          />
          <span className="break-words">www.thelabyrinth.africa</span>
        </a>
      </div>
    </footer>
  );
}
