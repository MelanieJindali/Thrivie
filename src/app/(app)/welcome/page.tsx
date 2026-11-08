import { getSettings } from "@/lib/settings";
import { Onboarding } from "./Onboarding";

export default async function WelcomePage() {
  const s = await getSettings();
  return <Onboarding name={s.name} units={s.units} />;
}
