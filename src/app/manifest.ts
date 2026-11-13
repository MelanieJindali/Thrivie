import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thrivie · Fitness & Nutrition",
    short_name: "Thrivie",
    description: "Track health, workouts, nutrition, habits, goals and a journal, privately.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F1E9",
    theme_color: "#1E3A64",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Smart Import", url: "/import" },
      { name: "Habits", url: "/habits" },
      { name: "Journal", url: "/journal" },
    ],
  };
}
