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
  today: { hover: "group-hover:text-gold-ink", text: "text-gold-ink", soft: "bg-gold-soft", grad: "from-gold-ink to-gold-ink", ring: "ring-gold-ink/30" },
  health: { hover: "group-hover:text-terracotta-ink", text: "text-terracotta-ink", soft: "bg-terracotta-soft", grad: "from-terracotta-ink to-gold-ink", ring: "ring-terracotta-ink/30" },
  workouts: { hover: "group-hover:text-ocean", text: "text-ocean", soft: "bg-ocean-soft", grad: "from-ocean to-primary", ring: "ring-ocean/30" },
  habits: { hover: "group-hover:text-sage-ink", text: "text-sage-ink", soft: "bg-sage-soft", grad: "from-sage-ink to-primary", ring: "ring-sage-ink/30" },
  goals: { hover: "group-hover:text-gold-ink", text: "text-gold-ink", soft: "bg-gold-soft", grad: "from-gold-ink to-terracotta-ink", ring: "ring-gold-ink/30" },
  journal: { hover: "group-hover:text-iris", text: "text-iris", soft: "bg-iris-soft", grad: "from-iris to-ocean", ring: "ring-iris/30" },
  import: { hover: "group-hover:text-primary", text: "text-primary", soft: "bg-primary-soft", grad: "from-primary to-iris", ring: "ring-primary/30" },
  settings: { hover: "group-hover:text-text", text: "text-muted", soft: "bg-surface-2", grad: "from-muted to-text", ring: "ring-border" },
} as const;
export type ThemeKey = keyof typeof THEME;
