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
