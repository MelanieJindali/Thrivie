"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Password field with a show/hide toggle and a Caps Lock warning. */
export function PasswordInput({
  name, label, autoComplete, hint, minLength, required = true, placeholder, className = "", inputClassName = "", autoFocus,
}: {
  name: string; label: string; autoComplete: "current-password" | "new-password"; hint?: React.ReactNode;
  minLength?: number; required?: boolean; placeholder?: string; className?: string; inputClassName?: string; autoFocus?: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const capsCheck = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  const described = [hint ? `${id}-hint` : "", caps ? `${id}-caps` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`block ${className}`}>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id}
          className={`input pr-12 ${inputClassName}`}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          minLength={minLength}
          maxLength={200}
          required={required}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-describedby={described}
          onKeyDown={capsCheck}
          onKeyUp={capsCheck}
          onBlur={() => setCaps(false)}
        />
        <button
          type="button"
          className="absolute top-1/2 right-1 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-muted hover:text-text"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-controls={id}
        >
          {shown ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {caps && <span id={`${id}-caps`} className="mt-1 block text-xs font-semibold text-terracotta-ink" role="status">Caps Lock is on.</span>}
      {hint && <span id={`${id}-hint`} className="mt-1 block text-xs text-muted">{hint}</span>}
    </div>
  );
}
