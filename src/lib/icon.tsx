import { ImageResponse } from "next/og";
import { BRAND_NAVY, BRAND_NAVY_DEEP, LogoGlyph } from "@/components/Brand";

/** Renders the Thrivie logo as a PNG (PWA manifest icons and the Apple touch icon). */
export function renderIcon(size: number, maskable = false) {
  // Maskable icons are cropped to a circle on Android, so keep the glyph in the safe zone.
  const glyph = Math.round(size * (maskable ? 0.6 : 0.74));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(145deg, #2B528D, ${BRAND_NAVY} 55%, ${BRAND_NAVY_DEEP})`, borderRadius: maskable ? 0 : size * 0.22 }}>
        <LogoGlyph size={glyph} color="#FFFFFF" />
      </div>
    ),
    { width: size, height: size },
  );
}
