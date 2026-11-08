import { LoginForm } from "../AuthForms";
import { magicLinksEnabled } from "@/lib/email";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string; signedout?: string }> }) {
  const { next, deleted, signedout } = await searchParams;
  const notice = deleted ? "Your account and all of its data were permanently deleted." : signedout ? "You're signed out." : undefined;
  return <LoginForm next={next} notice={notice} magic={magicLinksEnabled()} />;
}
