// Daily calorie and macro targets with safety rules. Pure module (client + server).
//
// - BMR: Mifflin-St Jeor (kg, cm, years). "Prefer not to say" uses the midpoint of the two sex constants.
// - Daily needs: BMR × activity factor.
// - Goal adjustment: −500 (lose), 0, +300 (gain muscle); always within ±500 kcal/day.
// - Floors: never below 1,200 kcal (female), 1,500 kcal (male, and "prefer not to say", the higher floor), or BMR.
// - No plans for under-18s or during pregnancy/breastfeeding; no weight-loss plans when BMI < 18.5.
// Plans are general guidance for healthy adults, not medical advice.
import { z } from "zod";

export const SEXES = ["female", "male", "unspecified"] as const;
export const ACTIVITY = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export const GOALS = ["lose", "maintain", "gain"] as const;
export const DIETS = ["none", "vegetarian", "vegan", "pescatarian"] as const;
export const ALLERGENS = ["dairy", "gluten", "nuts", "eggs", "soy", "shellfish", "fish"] as const;

export type Sex = (typeof SEXES)[number];
export type ActivityLevel = (typeof ACTIVITY)[number];
export type Goal = (typeof GOALS)[number];
export type DietType = (typeof DIETS)[number];
export type Allergen = (typeof ALLERGENS)[number];

export const LIMITS = { heightCm: { min: 120, max: 230 }, weightKg: { min: 35, max: 250 }, age: { min: 13, max: 100 } } as const;

/** Strict validation for anything that reaches the server or comes out of storage. */
export const BodyProfileSchema = z.object({
  heightCm: z.number().finite().min(LIMITS.heightCm.min, "Enter a height between 3′11″ and 7′7″ (120–230 cm).").max(LIMITS.heightCm.max, "Enter a height between 3′11″ and 7′7″ (120–230 cm)."),
  weightKg: z.number().finite().min(LIMITS.weightKg.min, "Enter a weight between 77 and 551 lb (35–250 kg).").max(LIMITS.weightKg.max, "Enter a weight between 77 and 551 lb (35–250 kg)."),
  age: z.number().int("Enter your age in whole years.").min(LIMITS.age.min, "Enter an age between 13 and 100.").max(LIMITS.age.max, "Enter an age between 13 and 100."),
  sex: z.enum(SEXES),
  pregnantOrBreastfeeding: z.boolean().default(false),
  activity: z.enum(ACTIVITY),
  goal: z.enum(GOALS),
  diet: z.enum(DIETS),
  allergies: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).transform((a) => [...new Set(a)]),
});
export type BodyProfile = z.infer<typeof BodyProfileSchema>;

export type NutritionTargets = { bmr: number; tdee: number; calories: number; proteinG: number; carbsG: number; fatG: number; floorApplied: boolean };
export type SafetyBlockReason = "under_18" | "pregnant_or_breastfeeding" | "underweight_weight_loss";
export type TargetsResult = { ok: true; targets: NutritionTargets; notes: string[] } | { ok: false; reason: SafetyBlockReason; message: string };

export const ACTIVITY_LEVELS: readonly { value: ActivityLevel; label: string; description: string; factor: number }[] = [
  { value: "sedentary", label: "Mostly sitting", description: "Desk job, little exercise", factor: 1.2 },
  { value: "light", label: "Lightly active", description: "Light exercise 1–3 days a week", factor: 1.375 },
  { value: "moderate", label: "Moderately active", description: "Exercise 3–5 days a week", factor: 1.55 },
  { value: "active", label: "Very active", description: "Hard exercise 6–7 days a week", factor: 1.725 },
  { value: "very_active", label: "Extremely active", description: "Physical job plus daily training", factor: 1.9 },
];

const SEX_CONSTANT: Record<Sex, number> = { male: 5, female: -161, unspecified: -78 };
export const CALORIE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500, unspecified: 1500 };
export const GOAL_ADJUSTMENT: Record<Goal, number> = { lose: -500, maintain: 0, gain: 300 };
const PROTEIN_G_PER_KG: Record<Goal, number> = { lose: 1.6, maintain: 1.2, gain: 1.8 };
const FAT_SHARE = 0.3;

export const lbToKg = (lb: number) => lb * 0.45359237;
export const kgToLb = (kg: number) => kg / 0.45359237;
export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * 2.54;
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const total = Math.round(cm / 2.54);
  return { ft: Math.floor(total / 12), in: total % 12 };
}

export const calculateBmi = (heightCm: number, weightKg: number) => weightKg / (heightCm / 100) ** 2;
export const calculateBmr = ({ weightKg, heightCm, age, sex }: Pick<BodyProfile, "weightKg" | "heightCm" | "age" | "sex">) => 10 * weightKg + 6.25 * heightCm - 5 * age + SEX_CONSTANT[sex];
export const activityFactor = (a: ActivityLevel) => ACTIVITY_LEVELS.find((x) => x.value === a)!.factor;

export const SAFETY_MESSAGES: Record<SafetyBlockReason, string> = {
  under_18: "Meal plans here are designed for adults. Growing bodies have different needs, so a doctor or registered dietitian is the best guide for an eating plan made for you.",
  pregnant_or_breastfeeding: "Nutrition needs change during pregnancy and breastfeeding. Your doctor, midwife or a registered dietitian can create a plan that supports you both.",
  underweight_weight_loss: "We can't create a weight-loss plan at your current height and weight. A doctor or registered dietitian can help you find the right goal for you. You can still choose a maintain or gain-muscle plan.",
};

/** Calorie and macro targets, or a kind explanation when a plan isn't appropriate. Throws on an invalid profile. */
export function calculateTargets(input: BodyProfile): TargetsResult {
  const p = BodyProfileSchema.parse(input);
  const block = (reason: SafetyBlockReason): TargetsResult => ({ ok: false, reason, message: SAFETY_MESSAGES[reason] });
  if (p.age < 18) return block("under_18");
  if (p.sex !== "male" && p.pregnantOrBreastfeeding) return block("pregnant_or_breastfeeding");
  const bmi = calculateBmi(p.heightCm, p.weightKg);
  if (p.goal === "lose" && bmi < 18.5) return block("underweight_weight_loss");

  const bmr = calculateBmr(p);
  const tdee = bmr * activityFactor(p.activity);
  const desired = tdee + GOAL_ADJUSTMENT[p.goal];
  const floor = Math.max(CALORIE_FLOOR[p.sex], bmr);
  const calories = Math.max(Math.round(desired / 10) * 10, Math.ceil(floor / 10) * 10);
  const floorApplied = desired < floor;

  // Protein by body weight (≤ 35% of calories), fat 30% of calories, carbs fill the rest.
  const proteinG = Math.min(Math.round(PROTEIN_G_PER_KG[p.goal] * p.weightKg), Math.round((calories * 0.35) / 4));
  const fatG = Math.round((calories * FAT_SHARE) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  const notes: string[] = [];
  if (floorApplied) notes.push("Your target is set at a safe minimum intake, so changes may be gradual.");
  if (p.sex === "unspecified") notes.push("This target uses a neutral average in the energy equation. You can add sex assigned at birth in Body & Goals for a more precise estimate.");
  if (bmi < 18.5 && p.goal !== "lose") notes.push("Based on your current height and weight, a doctor or registered dietitian can help confirm the right goal for you.");
  return { ok: true, targets: { bmr: Math.round(bmr), tdee: Math.round(tdee), calories, proteinG, carbsG, fatG, floorApplied }, notes };
}

export const NOT_MEDICAL_ADVICE = "Plans are general guidance for healthy adults, not medical advice. For medical conditions, talk to your doctor or a registered dietitian.";
