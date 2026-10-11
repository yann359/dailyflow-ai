import { recentDates, weekStart } from './dates';
import { totalNutrition } from './nutrition';
import type { Tables } from './schemas';
export function weeklySummary(data: Tables, date: string) {
  const dates = recentDates(date, 7);
  const meals = data.meals.filter((m) => dates.includes(m.date));
  const bodies = data.measurements.filter((m) => dates.includes(m.date));
  const daily = dates.map((d) => ({
    date: d,
    ...totalNutrition(meals.filter((m) => m.date === d)),
    recorded: meals.some((m) => m.date === d),
  }));
  const recorded = daily.filter((d) => d.recorded);
  const activeHabits = data.habits.filter((h) => !h.paused);
  const habitTarget = activeHabits.reduce(
    (sum, h) => sum + (h.frequency === 'daily' ? 7 : h.weeklyGoal),
    0,
  );
  const habitDone = activeHabits.reduce(
    (sum, h) =>
      sum +
      Math.min(
        h.frequency === 'daily' ? 7 : h.weeklyGoal,
        new Set(
          data.checkIns
            .filter((c) => c.habitId === h.id && dates.includes(c.date))
            .map((c) => c.date),
        ).size,
      ),
    0,
  );
  const averageWeight = bodies.length
    ? Math.round(
        (bodies.reduce((s, m) => s + m.weight, 0) / bodies.length) * 100,
      ) / 100
    : null;
  return {
    dates,
    recordedDays: recorded.length,
    mealCount: meals.length,
    averageProtein: recorded.length
      ? Math.round(
          recorded.reduce((s, d) => s + d.protein, 0) / recorded.length,
        )
      : null,
    averageWeight,
    measurementCount: bodies.length,
    workouts: data.sessions.filter((s) => dates.includes(s.date) && s.completed)
      .length,
    habitRate: habitTarget ? Math.round((habitDone / habitTarget) * 100) : 0,
    proteinTarget: data.targets[0]?.protein ?? 120,
    daily,
  };
}
export function localWeeklyReport(data: Tables, date: string) {
  const s = weeklySummary(data, date);
  return `【事实】最近7天记录了 ${s.recordedDays} 天饮食，共 ${s.mealCount} 条；完成 ${s.workouts} 次训练。最近7天的习惯完成率为 ${s.habitRate}%。${s.averageWeight === null ? '尚无身体测量记录。' : `近7天平均体重 ${s.averageWeight} kg（${s.measurementCount} 次测量）。`}\n\n【估算】${s.averageProtein === null ? '缺少饮食数据，无法估算蛋白质摄入。' : `有记录日期的平均蛋白质约 ${s.averageProtein} g，营养值取决于食物来源和记录完整度。`}单周数据无法解释体重变化的原因。\n\n【下周建议】\n1. 从记录一餐开始，把蛋白质食物搭配在规律三餐中。\n2. 按舒适节奏安排训练，动作稳定后再逐渐增加难度。\n3. 在相近时间测量体重，关注多周平均值。\n\n这是本地规则复盘，没有调用AI模型。`;
}
export function coachContext(data: Tables, date: string) {
  const p = data.profiles[0];
  return {
    date,
    profile: p
      ? { age: p.age, height: p.height, goal: p.goal, activity: p.activity }
      : null,
    target: data.targets[0]
      ? { calories: data.targets[0].calories, protein: data.targets[0].protein }
      : null,
    today: totalNutrition(data.meals.filter((m) => m.date === date)),
    week: weeklySummary(data, date),
    priorWeek: weeklySummary(data, recentDates(date, 8)[0]),
    weekStart: weekStart(date),
  };
}
