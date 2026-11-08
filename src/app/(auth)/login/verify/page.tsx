import { redirect } from "next/navigation";
import { getPendingMfaUser } from "@/lib/auth";
import { VerifyForm } from "../../AuthForms";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await getPendingMfaUser())) redirect("/login");
  const { next } = await searchParams;
  return <VerifyForm next={next} />;
}
