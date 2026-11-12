import { redirect } from "next/navigation";
import { EmailCodeLogin } from "../../AuthForms";
import { emailEnabled } from "@/lib/email";

export const metadata = { title: "Sign in with a code · Thrivie" };

export default async function CodePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!emailEnabled()) redirect("/login");
  return <EmailCodeLogin next={(await searchParams).next} />;
}
