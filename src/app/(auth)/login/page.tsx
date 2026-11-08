import { LoginForm } from "../AuthForms";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string }> }) {
  const { next, deleted } = await searchParams;
  return <LoginForm next={next} notice={deleted ? "Your account and all of its data were deleted." : undefined} />;
}
