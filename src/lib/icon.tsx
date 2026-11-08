import { ImageResponse } from "next/og";

/** Renders the Thrivie leaf icon as a PNG (used for the PWA manifest and Apple touch icon). */
export function renderIcon(size: number, maskable = false) {
  const pad = maskable ? size * 0.12 : 0;
  const inner = size - pad * 2;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#5b8a72", borderRadius: maskable ? 0 : size * 0.22 }}>
        <svg width={inner * 0.8} height={inner * 0.8} viewBox="100 100 312 312">
          <path d="M256 400V250" stroke="#fff" strokeWidth="28" strokeLinecap="round" />
          <path d="M256 262c0-70 48-122 128-126 0 80-50 128-128 126z" fill="#e3eee7" />
          <path d="M256 300c0-60-40-104-108-108 0 68 42 110 108 108z" fill="#fff" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
