"use client";

import { useEffect } from "react";

/** Clears the previous on-device model's files from this browser once, in the background. Renders nothing. */
export function LegacyAiCleanup() {
  useEffect(() => {
    void import("@/lib/legacyAiCleanup").then((m) => m.cleanUpLegacyAiOnce());
  }, []);
  return null;
}
