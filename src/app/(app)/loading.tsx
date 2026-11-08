// Skeleton shown while a screen loads — never a blank page.
export default function Loading() {
  const bar = "animate-pulse rounded-2xl bg-surface-2/80";
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3 pt-1"><div className={`${bar} h-3 w-40`} /><div className={`${bar} h-9 w-72 max-w-full`} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`${bar} h-44 lg:col-span-2`} />
        <div className={`${bar} h-44`} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={`${bar} h-20`} />)}</div>
      <div className="grid gap-6 lg:grid-cols-2"><div className={`${bar} h-64`} /><div className={`${bar} h-64`} /></div>
    </div>
  );
}
