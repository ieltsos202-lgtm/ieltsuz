import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IELTSUZ — AI IELTS tayyorgarlik platformasi",
    short_name: "IELTSUZ",
    description:
      "O'zbekistonning #1 AI IELTS tayyorgarlik platformasi. To'rt ko'nikma bo'yicha tezkor AI baho va haqiqiy Cambridge testlari.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0F",
    theme_color: "#6366f1",
    lang: "uz",
    categories: ["education"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
