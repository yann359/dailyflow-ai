import { z } from 'zod';
import { nutritionSchema } from '../schemas';
export const aiRequestSchema = z
  .object({
    task: z.enum(['meal', 'label', 'coach', 'weekly']),
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
  })
  .superRefine((request, ctx) => {
    if (request.task === 'label' && !request.image)
      ctx.addIssue({ code: 'custom', message: '需要上传营养标签照片' });
    if (request.task === 'meal' && !request.text.trim())
      ctx.addIssue({ code: 'custom', message: '请输入饮食描述' });
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
export type AIRequest = z.infer<typeof aiRequestSchema>;
export type AIResult =
  | z.infer<typeof mealResultSchema>
  | z.infer<typeof labelResultSchema>
  | z.infer<typeof coachResultSchema>;
export interface AIProvider {
  name: string;
  generate(request: AIRequest): Promise<AIResult>;
  stream(
    request: AIRequest,
    onDelta: (text: string) => void,
  ): Promise<AIResult>;
}
export function formatCoach(result: z.infer<typeof coachResultSchema>) {
  return `【事实】\n${result.facts.join('\n') || '可用记录不足。'}\n\n【估算】\n${result.estimates.join('\n') || '没有可靠估算。'}\n\n【建议】\n${result.advice.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
}
