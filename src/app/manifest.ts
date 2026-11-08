import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thrivie · Fitness & Nutrition",
    short_name: "Thrivie",
    description: "Track health, workouts, nutrition, habits, goals and a journal — privately.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F1E9",
    theme_color: "#1B375E",
    orientation: "portrait",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Smart Import", url: "/import" },
      { name: "Habits", url: "/habits" },
      { name: "Journal", url: "/journal" },
    ],
  };
}
