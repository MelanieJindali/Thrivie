export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl bg-linear-to-br from-primary to-primary-2 shadow-lg shadow-primary/25"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="100 100 312 312">
        <path d="M256 400V250" stroke="#f6ecd8" strokeWidth="26" strokeLinecap="round" />
        <path d="M256 262c0-70 48-122 128-126 0 80-50 128-128 126z" fill="#d8b46c" />
        <path d="M256 300c0-60-40-104-108-108 0 68 42 110 108 108z" fill="#fff" />
      </svg>
    </span>
  );
}
