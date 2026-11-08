import { getSettings } from "@/lib/settings";
import { WelcomeChoices } from "./WelcomeChoices";

export default async function WelcomePage() {
  const { name } = await getSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-4">
      <div className="text-center">
        <p className="eyebrow">Welcome{name ? `, ${name}` : ""}</p>
        <h1 className="h1 mt-2">Let&apos;s make this yours</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          Your account is private: only you can see what you log here. How would you like to begin?
        </p>
      </div>
      <WelcomeChoices />
      <div className="card space-y-2 text-sm">
        <h2 className="h2">📱 Add Thrivie to your home screen</h2>
        <p className="text-muted"><b className="text-text">iPhone:</b> in Safari, tap <b className="text-text">Share</b> → <b className="text-text">Add to Home Screen</b>.</p>
        <p className="text-muted"><b className="text-text">Android:</b> in Chrome, tap <b className="text-text">⋮</b> → <b className="text-text">Install app</b>.</p>
      </div>
    </div>
  );
}
