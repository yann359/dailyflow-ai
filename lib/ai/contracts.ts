import { z } from 'zod';
import { nutritionSchema } from '../schemas';
import { preferencesSchema, providerIds } from './catalog';
export const aiRequestSchema = z
  .object({
    task: z.enum(['meal', 'photo', 'label', 'coach', 'weekly']),
    text: z.string().max(1000).default(''),
    image: z
      .string()
      .max(2200000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    context: z.record(z.string(), z.unknown()).optional(),
    foods: z
      .array(
        z.object({
          id: z.string().max(100),
          name: z.string().max(60),
          unit: z.enum(['g', 'ml']),
          serving: z.number().positive().max(2000),
          servingName: z.string().max(20),
        }),
      )
      .max(500)
      .optional(),
    stream: z.boolean().optional(),
    preferences: preferencesSchema.optional(),
    requestId: z.string().uuid().optional(),
    plan: z.string().max(6000).optional(),
    consent: z.array(z.enum(providerIds)).max(4).optional(),
  })
  .superRefine((request, ctx) => {
    if (
      (request.task === 'label' || request.task === 'photo') &&
      !request.image
    )
      ctx.addIssue({ code: 'custom', message: '需要上传营养标签照片' });
    if (request.task === 'meal' && !request.text.trim())
      ctx.addIssue({ code: 'custom', message: '请输入饮食描述' });
    if (request.context && JSON.stringify(request.context).length > 24000)
      ctx.addIssue({ code: 'custom', message: '统计内容过大' });
  });
export const mealResultSchema = z.object({
  items: z
    .array(
      z.object({
        foodId: z.string(),
        name: z.string(),
        amount: z.number().positive().max(10000),
        unit: z.enum(['g', 'ml']),
        note: z.string(),
      }),
    )
    .max(30),
  warnings: z.array(z.string()).max(30),
});
export const labelResultSchema = z.object({
  name: z.string().min(1).max(60),
  unit: z.enum(['g', 'ml']),
  nutrition: nutritionSchema,
  notes: z.array(z.string()).max(20),
});
export const coachResultSchema = z.object({
  facts: z.array(z.string()).max(10),
  estimates: z.array(z.string()).max(10),
  advice: z.array(z.string()).max(5),
});
export const textResultSchema = z.object({
  answer: z.string().min(1).max(12000),
});
export const weeklyResultSchema = z.object({
  diet: z.string().max(2000),
  training: z.string().max(2000),
  habits: z.string().max(2000),
  body: z.string().max(2000),
  missingData: z.array(z.string()).max(14),
  advice: z.array(z.string().max(800)).length(3),
});
export const photoResultSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        amount: z.number().positive().max(10000),
        unit: z.enum(['g', 'ml']),
        nutrition: nutritionSchema,
        note: z.string().max(500),
      }),
    )
    .min(1)
    .max(12),
  warnings: z.array(z.string().max(500)).max(20),
});
export type AIRequest = z.infer<typeof aiRequestSchema>;
export type AIResult =
  | z.infer<typeof mealResultSchema>
  | z.infer<typeof labelResultSchema>
  | z.infer<typeof coachResultSchema>
  | z.infer<typeof textResultSchema>
  | z.infer<typeof weeklyResultSchema>
  | z.infer<typeof photoResultSchema>;
export function resultSchema(task: AIRequest['task']) {
  return task === 'meal'
    ? mealResultSchema
    : task === 'label'
      ? labelResultSchema
      : task === 'photo'
        ? photoResultSchema
        : task === 'weekly'
          ? weeklyResultSchema
          : textResultSchema;
}
export function formatWeekly(result: z.infer<typeof weeklyResultSchema>) {
  return `【饮食评价】\n${result.diet}\n\n【训练评价】\n${result.training}\n\n【习惯完成】\n${result.habits}\n\n【身体趋势】\n${result.body}\n\n【数据缺失】\n${result.missingData.join('\n') || '请留意记录完整度。'}\n\n【下周3项建议】\n${result.advice.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
}
export function formatCoach(result: z.infer<typeof coachResultSchema>) {
  return `【事实】\n${result.facts.join('\n') || '可用记录不足。'}\n\n【估算】\n${result.estimates.join('\n') || '没有可靠估算。'}\n\n【建议】\n${result.advice.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
}
