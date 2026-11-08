// Thrivie brand: a fork-and-spoon crossed with a dumbbell (fitness & nutrition),
// set on the brand navy. One glyph is shared by the app, the PWA icons and
// public/icon.svg so the logo is identical everywhere.

export const BRAND_NAVY = "#1B375E";
export const BRAND_NAVY_DEEP = "#0F2240";

/** The white logo glyph. Inherits colour from `currentColor`. */
export function LogoGlyph({ size, color = "currentColor" }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="-64 -64 128 128" fill={color} aria-hidden>
      <g transform="rotate(45)">
        <rect x="-40" y="-2.4" width="74" height="4.8" />
        <path d="M-49-13.5h3.5c6 0 11 6.5 15.5 11.1v4.8c-4.5 4.6-9.5 11.1-15.5 11.1h-3.5c-2.5-4-3.5-8.5-3.5-13.5s1-9.5 3.5-13.5z" />
        <rect x="-68" y="-13.5" width="22" height="4.6" rx="2.3" />
        <rect x="-68" y="-6.4" width="22" height="4.6" rx="2.3" />
        <rect x="-68" y="0.7" width="22" height="4.6" rx="2.3" />
        <rect x="-68" y="8.9" width="22" height="4.6" rx="2.3" />
        <path d="M30 0c2-8 12-14 22-14 9 0 14 6.5 14 14s-5 14-14 14c-10 0-20-6-22-14z" />
      </g>
      <g transform="rotate(-45)">
        <rect x="-40" y="-2.4" width="80" height="4.8" />
        <rect x="23" y="-17.5" width="15" height="35" rx="1.5" />
        <rect x="-38" y="-17.5" width="15" height="35" rx="1.5" />
        <rect x="40" y="-15" width="12" height="30" rx="1.5" />
        <rect x="-52" y="-15" width="12" height="30" rx="1.5" />
        <rect x="54.5" y="-4" width="3.5" height="8" rx="1.2" />
        <rect x="-58" y="-4" width="3.5" height="8" rx="1.2" />
      </g>
    </svg>
  );
}

/** App-icon style mark: white glyph on a navy rounded square. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[28%] text-white shadow-lg shadow-[#0F2240]/30 ring-1 ring-white/10"
      style={{ width: size, height: size, background: `linear-gradient(145deg, #2B528D, ${BRAND_NAVY} 55%, ${BRAND_NAVY_DEEP})` }}
      aria-hidden
    >
      <LogoGlyph size={size * 0.72} />
    </span>
  );
}

/** "THRIVIE" wordmark in the logo's light, wide-tracked caps. */
export function Wordmark({ className = "", tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <span className={`inline-flex flex-col items-center leading-none ${className}`}>
      <span className="wordmark">Thrivie</span>
      {tagline && <span className="mt-3 mr-[-0.34em] font-sans text-[11px] font-semibold tracking-[0.34em] whitespace-nowrap text-muted uppercase">Fitness &amp; Nutrition</span>}
    </span>
  );
}
