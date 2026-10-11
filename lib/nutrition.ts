import type { FoodItem, Nutrition, MealEntry } from './schemas';
export const emptyNutrition = (): Nutrition => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});
export function scaleNutrition(
  nutrition: Nutrition,
  amount: number,
): Nutrition {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error('食用量必须大于0');
  return Object.fromEntries(
    Object.entries(nutrition).map(([key, value]) => [
      key,
      Math.round(((value * amount) / 100) * 100) / 100,
    ]),
  ) as Nutrition;
}
export function totalNutrition(meals: MealEntry[]): Nutrition {
  return meals.reduce((total, item) => {
    for (const key of Object.keys(total) as (keyof Nutrition)[])
      total[key] += item.nutrition[key];
    return total;
  }, emptyNutrition());
}
export const mealLabels = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};
export type FoodDraft = {
  foodId: string;
  name: string;
  amount: number;
  unit: 'g' | 'ml';
  note: string;
};
// 明确的本地规则解析，只识别已知食物和明确数量，不能伪装为模型。
export function parseLocalMeal(
  text: string,
  foods: FoodItem[],
): { items: FoodDraft[]; warnings: string[] } {
  const items: FoodDraft[] = [];
  const warnings: string[] = [];
  const aliases: Record<string, string> = {
    牛奶: '纯牛奶',
    吐司: '全麦吐司',
    米饭: '熟米饭',
  };
  for (const raw of text.split(/[、,，;；和\n]/).filter(Boolean)) {
    const part = raw.trim();
    const food = foods.find(
      (f) =>
        part.includes(f.name) ||
        Object.entries(aliases).some(
          ([alias, name]) => f.name === name && part.includes(alias),
        ),
    );
    const match = part.match(/(\d+(?:\.\d+)?)\s*(ml|毫升|克|g|个|片|份)/i);
    if (!food || !match) {
      warnings.push(`“${part}”需要手动确认食物和份量`);
      continue;
    }
    const quantity = Number(match[1]);
    const unit = match[2].toLowerCase();
    const measured = ['ml', '毫升', 'g', '克'].includes(unit);
    if (
      (['ml', '毫升'].includes(unit) && food.unit !== 'ml') ||
      (['g', '克'].includes(unit) && food.unit !== 'g')
    ) {
      warnings.push(`“${part}”的单位与食物库不一致`);
      continue;
    }
    const amount = measured ? quantity : quantity * food.serving;
    if (amount <= 0 || amount > 10000) {
      warnings.push(`“${part}”的份量超出范围`);
      continue;
    }
    items.push({
      foodId: food.id,
      name: food.name,
      amount,
      unit: food.unit,
      note: measured
        ? food.source
        : `按${food.servingName}约${food.serving}${food.unit}换算；${food.source}`,
    });
  }
  return { items, warnings };
}
