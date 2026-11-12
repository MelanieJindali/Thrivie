import { LoginForm } from "../AuthForms";
import { emailEnabled } from "@/lib/email";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string; signedout?: string; reset?: string }> }) {
  const { next, deleted, signedout, reset } = await searchParams;
  const notice = reset ? "Your password is reset. Sign in with your new one." : deleted ? "Your account and all of its data were permanently deleted." : signedout ? "You're signed out." : undefined;
  return <LoginForm next={next} notice={notice} emailCodes={emailEnabled()} />;
}
