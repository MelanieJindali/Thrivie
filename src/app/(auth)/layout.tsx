import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BrandMark, Wordmark } from "@/components/Brand";
import { MEDICAL_NOTE } from "@/lib/constants";

export const metadata = {
  title: "Sign in · Thrivie",
  description: "Thrivie is a calm, private wellness tracker for health, workouts, nutrition, habits, goals and a journal.",
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size={72} />
          <h1 className="mt-5 text-4xl text-text"><Wordmark tagline /></h1>
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-muted">{MEDICAL_NOTE}</p>
      </div>
    </main>
  );
}
