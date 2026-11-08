import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { MEDICAL_NOTE } from "@/lib/constants";

export const metadata = {
  title: "Sign in · Thrivie",
  description: "Thrivie is a calm, private wellness tracker for health, workouts, nutrition, habits, goals and a journal.",
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="brand-bg flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="mb-4 flex justify-center">
          <Logo variant="lockup" tone="light" size="2xl" />
        </h1>
        {children}
        <p className="mt-8 text-center text-xs text-white/85">{MEDICAL_NOTE}</p>
      </div>
    </main>
  );
}
