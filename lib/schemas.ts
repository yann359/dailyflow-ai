import { z } from 'zod';
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, '日期无效');
const meta = {
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
  ownerId: z.string().default('local'),
};
export const nutritionSchema = z.object({
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
});
export const profileSchema = z.object({
  ...meta,
  name: z.string().min(1).max(30),
  sex: z.enum(['male', 'female', 'other']),
  age: z.number().int().min(18).max(100),
  height: z.number().min(100).max(250),
  weight: z.number().min(30).max(300),
  goal: z.string().min(1).max(150),
  activity: z.enum(['low', 'moderate', 'high']),
});
export const foodSchema = z.object({
  ...meta,
  name: z.string().min(1).max(60),
  unit: z.enum(['g', 'ml']),
  serving: z.number().positive().max(2000),
  servingName: z.string().min(1).max(20),
  nutrition: nutritionSchema,
  source: z.string().min(1).max(200),
  favorite: z.boolean(),
});
export const mealSchema = z.object({
  ...meta,
  date: dateSchema,
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  foodId: z.string().min(1),
  foodName: z.string().min(1).max(60),
  amount: z.number().positive().max(10000),
  unit: z.enum(['g', 'ml']),
  nutrition: nutritionSchema,
  source: z.string().min(1).max(200),
});
export const targetSchema = z.object({
  ...meta,
  calories: z.number().min(1200).max(5000),
  protein: z.number().min(30).max(300),
  carbs: z.number().min(50).max(700),
  fat: z.number().min(20).max(200),
});
export const habitSchema = z.object({
  ...meta,
  name: z.string().min(1).max(30),
  icon: z.enum(['water', 'book', 'moon', 'walk', 'spark']),
  frequency: z.enum(['daily', 'weekly']),
  weeklyGoal: z.number().int().min(1).max(7),
  paused: z.boolean(),
});
export const checkInSchema = z.object({
  ...meta,
  habitId: z.string().min(1),
  date: dateSchema,
});
export const measurementSchema = z.object({
  ...meta,
  date: dateSchema,
  weight: z.number().min(30).max(300),
  waist: z.number().min(30).max(250).nullable(),
  photo: z
    .string()
    .max(2000000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .nullable()
    .default(null),
});
export const planSchema = z.object({
  ...meta,
  startDate: dateSchema,
  days: z
    .array(z.number().int().min(0).max(6))
    .length(3)
    .refine((days) => new Set(days).size === 3, '训练日不能重复'),
  paused: z.boolean(),
});
export const sessionSchema = z.object({
  ...meta,
  date: dateSchema,
  planId: z.string(),
  type: z.enum(['A', 'B']),
  week: z.number().int().min(1).max(12),
  completed: z.boolean(),
});
export const setSchema = z.object({
  ...meta,
  sessionId: z.string(),
  exerciseId: z.string(),
  order: z.number().int().min(1).max(10),
  reps: z.number().int().min(0).max(300),
  load: z.number().min(0).max(300),
  completed: z.boolean(),
});
export const conversationSchema = z.object({
  ...meta,
  kind: z.enum(['coach', 'weekly']),
  question: z.string().max(1000),
  answer: z.string().max(12000),
  provider: z.enum(['local', 'openai']),
});
export const settingsSchema = z.object({
  ...meta,
  theme: z.enum(['light', 'dark', 'system']),
  aiEnabled: z.boolean(),
  notifications: z.boolean(),
  hiddenModules: z.array(z.enum(['nutrition', 'workout', 'habits', 'week'])),
  timezone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, '时区无效'),
});
export const tableSchemas = {
  profiles: profileSchema,
  foods: foodSchema,
  meals: mealSchema,
  targets: targetSchema,
  habits: habitSchema,
  checkIns: checkInSchema,
  measurements: measurementSchema,
  plans: planSchema,
  sessions: sessionSchema,
  sets: setSchema,
  conversations: conversationSchema,
  settings: settingsSchema,
};
export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  tables: z.object({
    profiles: z.array(profileSchema).max(10),
    foods: z.array(foodSchema).max(5000),
    meals: z.array(mealSchema).max(100000),
    targets: z.array(targetSchema).max(10),
    habits: z.array(habitSchema).max(1000),
    checkIns: z.array(checkInSchema).max(100000),
    measurements: z.array(measurementSchema).max(10000),
    plans: z.array(planSchema).max(10),
    sessions: z.array(sessionSchema).max(10000),
    sets: z.array(setSchema).max(100000),
    conversations: z.array(conversationSchema).max(10000),
    settings: z.array(settingsSchema).max(10),
  }),
});
export type Profile = z.infer<typeof profileSchema>;
export type FoodItem = z.infer<typeof foodSchema>;
export type MealEntry = z.infer<typeof mealSchema>;
export type NutritionTarget = z.infer<typeof targetSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitCheckIn = z.infer<typeof checkInSchema>;
export type BodyMeasurement = z.infer<typeof measurementSchema>;
export type WorkoutPlan = z.infer<typeof planSchema>;
export type WorkoutSession = z.infer<typeof sessionSchema>;
export type ExerciseSet = z.infer<typeof setSchema>;
export type AIConversation = z.infer<typeof conversationSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Nutrition = z.infer<typeof nutritionSchema>;
export type Backup = z.infer<typeof backupSchema>;
export type Tables = Backup['tables'];
export type TableName = keyof Tables;
export type Row<K extends TableName> = Tables[K][number];
