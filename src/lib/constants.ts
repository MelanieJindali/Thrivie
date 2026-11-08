export const WORKOUT_TYPES = ["strength", "cardio", "mobility", "sport", "other"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export const WORKOUT_LABELS: Record<WorkoutType, { label: string; emoji: string }> = {
  strength: { label: "Strength", emoji: "🏋️" },
  cardio: { label: "Cardio", emoji: "🏃" },
  mobility: { label: "Mobility", emoji: "🧘" },
  sport: { label: "Sport", emoji: "🎾" },
  other: { label: "Other", emoji: "✨" },
};

export const JOURNAL_PROMPTS = [
  "What went well today?",
  "What are you grateful for?",
  "How do you feel today?",
  "What's on your mind?",
  "What would make tomorrow great?",
  "What did you learn today?",
];

export const MOOD_EMOJI = ["😞", "😕", "😐", "🙂", "😄"];
export const ENERGY_EMOJI = ["🪫", "😴", "🙂", "⚡", "🚀"];

export const MODULE_INFO = {
  health: { label: "Health", href: "/health" },
  workouts: { label: "Workouts", href: "/workouts" },
  habits: { label: "Habits", href: "/habits" },
  goals: { label: "Goals", href: "/goals" },
  journal: { label: "Journal", href: "/journal" },
} as const;

export const MEDICAL_NOTE = "Thrivie is for personal tracking only and isn't medical advice.";

/** Visual identity per area of the app (literal class names so Tailwind picks them up). */
export const THEME = {
  today: { hover: "group-hover:text-gold", text: "text-gold", soft: "bg-gold-soft", grad: "from-gold to-amber", ring: "ring-gold/30" },
  health: { hover: "group-hover:text-rose", text: "text-rose", soft: "bg-rose-soft", grad: "from-rose to-amber", ring: "ring-rose/30" },
  workouts: { hover: "group-hover:text-sapphire", text: "text-sapphire", soft: "bg-sapphire-soft", grad: "from-sapphire to-teal", ring: "ring-sapphire/30" },
  habits: { hover: "group-hover:text-emerald", text: "text-emerald", soft: "bg-emerald-soft", grad: "from-emerald to-teal", ring: "ring-emerald/30" },
  goals: { hover: "group-hover:text-amber", text: "text-amber", soft: "bg-amber-soft", grad: "from-amber to-rose", ring: "ring-amber/30" },
  journal: { hover: "group-hover:text-plum", text: "text-plum", soft: "bg-plum-soft", grad: "from-plum to-sapphire", ring: "ring-plum/30" },
  import: { hover: "group-hover:text-primary", text: "text-primary", soft: "bg-primary-soft", grad: "from-primary to-plum", ring: "ring-primary/30" },
  settings: { hover: "group-hover:text-text", text: "text-muted", soft: "bg-surface-2", grad: "from-muted to-text", ring: "ring-border" },
} as const;
export type ThemeKey = keyof typeof THEME;
