# Thrivie brand assets

The approved original is the front of the Thrivie business card (`thrivie-logo.jpg`, 2576×1472). It is the single source of truth.

## Where the artwork comes from

| Part | Source | Fidelity to the approved card (at original size) |
|---|---|---|
| Mark (fork, spoon and dumbbell) | Designer's vector file, *F&N Coach Logo.ai* (artboard 1). Shapes unchanged. Three zero-area Illustrator slivers were dropped. | 99.84% overlap (IoU), ink area −0.09% |
| "THRIVIE" | Traced from the card (the .ai sets it in Allerta Stencil, which isn't what the card uses). | 99.70% overlap, ink area +0.07% |
| "FITNESS & NUTRITION" | Traced from the card | 97.43% overlap, ink area +0.91% (strokes are ~3 px thick on the card, so 1 px of JPEG edge noise counts heavily) |
| **Whole lockup** | Mark and text placed exactly as on the card | **99.77% overlap, 99.96% pixel agreement** |

How it was made: the card's brightness was turned into coverage, upsampled 8× and thresholded at 50%, which removes JPEG blocks and halos without growing or shrinking the shapes. It was then traced with potrace. The vector mark was placed with one uniform scale and a translation fitted to the card (no rotation, no re-proportioning). SVGO was verified as visually lossless (150 of 1,368,800 pixels differ, all anti-aliasing). See `logo-proof.png`.

## Files (`public/brand/`)

- `thrivie-mark.svg`, `thrivie-lockup.svg`, `thrivie-wordmark.svg`: white masters (default, as on the card).
- `*-navy.svg`: brand navy `#1E3A64` for light backgrounds. Colour change only.
- `*@2048w.png` / `*@2400w.png`: transparent high-resolution PNG fallbacks.
- `thrivie-mark-ghost.svg`: the mark at 7% opacity, for the sign-in brand background only.
- `og-image.png`: 1200×630 social card (lockup on the card gradient).
- `public/icons/*`, `public/favicon.ico`, `public/icon.svg`: white mark on solid `#1E3A64`, with safe-zone padding (64% of the canvas for app icons, 54% for maskable so it stays inside Android's safe circle).

Regenerate everything except the masters with `node scripts/brand/build-assets.mjs`. `tests/brand.test.ts` fails if the app's logo ever differs from the masters, or if a colour variant changes anything but colour.

## Using the logo in the app

Use `<Logo variant="mark|lockup|wordmark" tone="light|dark|auto" size="xs…2xl" />` (`src/components/Logo.tsx`). Never use an `<img>` of the logo, or a font, in its place.

- **Tone:** `light` is white artwork for navy or dark backgrounds, `dark` is navy for light backgrounds, and `auto` follows the theme.
- **Size:** set by height only, through the `--logo-*` tokens. Width follows the artwork's aspect ratio. Use the lockup only at `2xl`, so the tagline stays readable.
- **Clear space:** reserved automatically on every side, equal to the height of the "T" in THRIVIE.
- **Colours** (sampled from the card): navy `#1E3A64`, corners `#0C1B30`, highlight `#355A8F`.
