import type { MetadataRoute } from "next";

const ICONS: MetadataRoute.Manifest["icons"] = [
  { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  {
    src: "/icons/icon-maskable-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
  { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
];

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SRH Ops — Terrain",
    short_name: "SRH Ops",
    description:
      "Console terrain SRH Recyclage : collectes, photos, signature et rapport digital, utilisable hors-ligne.",
    lang: "fr",
    id: "/",
    start_url: "/terrain",
    scope: "/terrain",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3faff",
    theme_color: "#0d631b",
    categories: ["business", "utilities"],
    icons: ICONS,
  };
}
