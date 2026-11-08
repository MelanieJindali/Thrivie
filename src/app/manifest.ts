import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thrivie — wellness tracker",
    short_name: "Thrivie",
    description: "Track health, workouts, habits, goals and a journal — privately.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#1f5c4a",
    orientation: "portrait",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "AI Notes Import", url: "/import" },
      { name: "Habits", url: "/habits" },
      { name: "Journal", url: "/journal" },
    ],
  };
}
