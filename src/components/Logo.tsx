import { LOGO, type LogoVariant } from "./logoData";

// The one way to show the Thrivie logo. Artwork comes from the approved master
// SVGs (public/brand/), inlined so it stays crisp and needs no extra request.
// Only colour ever changes; shapes, proportions and spacing never do.

/**
 * Rendered height per size token. Keep in sync with the --logo-* tokens in globals.css.
 * Use the lockup at 2xl only: smaller, its tagline drops below a readable size.
 */
export const LOGO_SIZES = { xs: 16, sm: 22, md: 32, lg: 64, xl: 120, "2xl": 200 } as const;
export type LogoSize = keyof typeof LOGO_SIZES;

/**
 * Clear space on every side, as a share of the variant's height: the height of
 * the "T" in THRIVIE at the lockup's own proportions.
 */
const CLEAR_SPACE: Record<LogoVariant, number> = {
  lockup: 102.37 / 1074.03, // T cap height ÷ lockup height
  wordmark: 1, // the wordmark is exactly one T tall
  mark: 102.37 / 740.54, // T height relative to the mark, as placed in the lockup
};

const TONE = {
  light: "text-white", // white artwork (default, as on the card) for dark/navy backgrounds
  dark: "text-brand-navy", // navy artwork for light backgrounds
  auto: "text-brand-navy dark:text-white", // follows the app theme
} as const;

const LABEL: Record<LogoVariant, string> = { lockup: "Thrivie, Fitness & Nutrition", wordmark: "Thrivie", mark: "Thrivie" };

export function Logo({
  variant = "lockup",
  tone = "auto",
  size = "md",
  clearSpace = true,
  decorative = false,
  className = "",
}: {
  variant?: LogoVariant;
  tone?: keyof typeof TONE;
  size?: LogoSize;
  /** Reserve the brand clear space around the logo (on by default). */
  clearSpace?: boolean;
  /** Hide from screen readers when a visible label already names the brand. */
  decorative?: boolean;
  className?: string;
}) {
  const art = LOGO[variant];
  const h = LOGO_SIZES[size];
  const w = Math.round((h * art.w) / art.h);
  return (
    <span
      className={`inline-block shrink-0 leading-none ${TONE[tone]} ${className}`}
      style={clearSpace ? { padding: `calc(var(--logo-${size}) * ${CLEAR_SPACE[variant].toFixed(4)})` } : undefined}
    >
      <svg
        viewBox={`0 0 ${art.w} ${art.h}`}
        width={w}
        height={h}
        // Sized by height only; width follows the artwork's own aspect ratio.
        style={{ height: `var(--logo-${size})`, width: "auto", aspectRatio: `${art.w} / ${art.h}`, display: "block" }}
        fill="currentColor"
        {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": LABEL[variant] })}
        focusable="false"
      >
        {art.paths.map((d, i) => <path key={i} d={d} />)}
      </svg>
    </span>
  );
}
