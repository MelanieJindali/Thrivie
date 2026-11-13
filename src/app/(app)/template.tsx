/** Remounts on every navigation, so each page's content eases in. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="t-page">{children}</div>;
}
