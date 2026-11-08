"use client";

import dynamic from "next/dynamic";

// Charts (Recharts) are split into their own bundle and loaded only on the
// screens that show them, keeping Today and the first load small.
const Skeleton = ({ h = 220 }: { h?: number }) => <div className="animate-pulse rounded-2xl bg-surface-2/70" style={{ height: h }} aria-hidden />;

export const TrendGroup = dynamic(() => import("./charts").then((m) => m.TrendGroup), { ssr: false, loading: () => <div className="card"><Skeleton h={300} /></div> });
export const WorkoutVolumeChart = dynamic(() => import("./charts").then((m) => m.WorkoutVolumeChart), { ssr: false, loading: () => <Skeleton /> });
