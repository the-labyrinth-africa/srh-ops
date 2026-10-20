/**
 * Génère les icônes PWA (PNG multi-tailles), le manifest, le service worker
 * et les assets associés.
 *
 * Approche : SVG source (géométrie pure, sans texte -> pas de dépendance
 * aux polices systèmes) → rastérisé en PNG via `sharp`. Aucun encodeur PNG
 * artisanal. Le SVG sert aussi de source pour src/app/icon.svg.
 *
 * Usage : npx tsx scripts/generate-pwa-icons.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const OUT_DIR = join(process.cwd(), "public", "icons");

interface IconSpec {
  name: string;
  size: number;
  maskable: boolean;
}

const ICONS: IconSpec[] = [
  { name: "icon-192x192.png", size: 192, maskable: false },
  { name: "icon-512x512.png", size: 512, maskable: false },
  { name: "icon-maskable-512x512.png", size: 512, maskable: true },
];

function iconSvg(maskable: boolean): string {
  const bg = maskable
    ? `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e9e47"/><stop offset="1" stop-color="#0a5716"/></linearGradient>`
    : `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e9e47"/><stop offset="1" stop-color="#0a5716"/></linearGradient>`;
  const rect = maskable
    ? `<rect x="0" y="0" width="512" height="512" fill="url(#bg)"/>`
    : `<rect x="24" y="24" width="464" height="464" rx="95" fill="url(#bg)" stroke="#064a12" stroke-width="14"/>`;
  const ring = `<circle cx="256" cy="256" r="150" fill="none" stroke="#ffffff" stroke-width="34"/>`;
  const monogram = `<path d="M148 195 L190 317 L256 220 L322 317 L364 195" fill="none" stroke="#ffffff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${bg}</defs>
  ${rect}
  ${maskable ? `<rect x="0" y="0" width="512" height="512" fill="none"/>` : ""}
  ${ring}
  ${monogram}
</svg>`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const spec of ICONS) {
    const png = await sharp(Buffer.from(iconSvg(spec.maskable)))
      .resize(spec.size, spec.size)
      .png()
      .toBuffer();
    writeFileSync(join(OUT_DIR, spec.name), png);
    console.log(`  ${spec.name} (${spec.size}x${spec.size}, ${png.length} o)`);
  }

  writeFileSync(join(process.cwd(), "src", "app", "icon.svg"), iconSvg(false));
  const appleIcon = await sharp(Buffer.from(iconSvg(false))).resize(180, 180).png().toBuffer();
  writeFileSync(join(process.cwd(), "public", "apple-touch-icon.png"), appleIcon);
  console.log("Icônes WOM PWA, Apple et favicon générées.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
