"use client";

import { useEffect } from "react";

/** Clears files left by the removed AI models from this browser once, in the background. Renders nothing. */
export function LegacyAiCleanup() {
  useEffect(() => {
    void import("@/lib/legacyAiCleanup").then((m) => m.cleanUpLegacyAiOnce());
  }, []);
  return null;
}
