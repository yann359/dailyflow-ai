import { describe, it, expect } from 'vitest';
import { localDate, addDays, weekStart, dateDistance } from '@/lib/dates';
import {
  scaleNutrition,
  parseLocalMeal,
  totalNutrition,
} from '@/lib/nutrition';
import {
  schedule,
  currentWorkout,
  trainingWeek,
  exercises,
} from '@/lib/workouts';
import { habitStreak, habitWeekRate } from '@/lib/habits';
import { dateSchema } from '@/lib/schemas';
import { metadata, seedFoods } from '@/lib/db';
const plan = {
  ...metadata('plan'),
  startDate: '2026-10-05',
  days: [1, 3, 5],
  paused: false,
};
const foods = seedFoods.map((f, i) => ({
  ...metadata(`food-${i}`),
  ...f,
  nutrition: { ...f.nutrition },
  favorite: false,
  source: '参考值',
}));
describe('日期与时区', () => {
  it('按用户时区判断日期，避免UTC跨日误差', () => {
    expect(localDate(new Date('2026-10-10T16:30:00Z'), 'Asia/Shanghai')).toBe(
      '2026-10-11',
    );
    expect(
      localDate(new Date('2026-10-10T16:30:00Z'), 'America/Los_Angeles'),
    ).toBe('2026-10-10');
  });
  it('跨年和闰年计算', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dateDistance('2026-10-11', '2026-10-05')).toBe(6);
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
  });
  it('拒绝不存在的日期', () => {
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(dateSchema.safeParse('2026-13-01').success).toBe(false);
  });
});
describe('营养换算和饮食解析', () => {
  it('每100ml标签换算250ml实际摄入', () => {
    expect(
      scaleNutrition({ calories: 64, protein: 3.2, carbs: 4.8, fat: 3.6 }, 250),
    ).toEqual({ calories: 160, protein: 8, carbs: 12, fat: 9 });
  });
  it('小份量精度与非法份量', () => {
    expect(
      scaleNutrition({ calories: 144, protein: 13.3, carbs: 2.8, fat: 8.8 }, 50)
        .protein,
    ).toBe(6.65);
    expect(() => scaleNutrition(foods[0].nutrition, 0)).toThrow();
    expect(() => scaleNutrition(foods[0].nutrition, NaN)).toThrow();
  });
  it('空白数据不伪造摄入', () => {
    expect(totalNutrition([])).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
  it('识别2个鸡蛋、2片吐司、250ml牛奶', () => {
    const result = parseLocalMeal(
      '今天早餐吃了2个鸡蛋、2片吐司、250ml牛奶',
      foods,
    );
    expect(result.items.map((i) => i.amount)).toEqual([100, 60, 250]);
    expect(result.warnings).toEqual([]);
  });
  it('不猜测未给数量或未知食物', () => {
    const result = parseLocalMeal('鸡蛋、1份神秘料理、200ml鸡胸肉', foods);
    expect(result.items).toEqual([]);
    expect(result.warnings).toHaveLength(3);
  });
  it('重复食物独立识别，可在确认时移除', () => {
    expect(parseLocalMeal('1个鸡蛋、1个鸡蛋', foods).items).toHaveLength(2);
  });
});
describe('12周训练计划', () => {
  it('36次训练连续AB交替，跨周不重置', () => {
    const sessions = schedule(plan);
    expect(sessions).toHaveLength(36);
    expect(sessions.slice(0, 6).map((s) => s.type)).toEqual([
      'A',
      'B',
      'A',
      'B',
      'A',
      'B',
    ]);
    expect(sessions.at(-1)?.week).toBe(12);
  });
  it('前2周减少训练量', () => {
    const sessions = schedule(plan);
    expect(sessions.slice(0, 6).every((s) => s.sets === 2)).toBe(true);
    expect(sessions.slice(6).every((s) => s.sets === 3)).toBe(true);
  });
  it('非周一开始不会安排开始日期之前的训练', () => {
    expect(schedule({ ...plan, startDate: '2026-10-08' })).toHaveLength(36);
    expect(
      schedule({ ...plan, startDate: '2026-10-08' }).every(
        (s) => s.date >= '2026-10-08',
      ),
    ).toBe(true);
  });
  it('暂停和恢复日没有今日任务', () => {
    expect(currentWorkout({ ...plan, paused: true }, '2026-10-05')).toBeNull();
    expect(currentWorkout(plan, '2026-10-06')).toBeNull();
    expect(currentWorkout(plan, '2026-10-05')?.type).toBe('A');
  });
  it('调整训练日使用新日期，周数上限12', () => {
    const sessions = schedule({ ...plan, days: [2, 4, 6] });
    expect(sessions[0].date).toBe('2026-10-06');
    expect(trainingWeek(plan, '2027-10-05')).toBe(12);
    expect(currentWorkout(plan, '2027-10-05')).toBeNull();
  });
  it('每个计划都有完整动作指导', () => {
    for (const list of Object.values(exercises)) {
      expect(list).toHaveLength(7);
      expect(list.every((e) => e.steps && e.caution && e.muscle)).toBe(true);
    }
  });
});
describe('习惯统计', () => {
  const habit = {
    ...metadata('h'),
    name: '阅读',
    icon: 'book' as const,
    frequency: 'daily' as const,
    weeklyGoal: 7,
    paused: false,
  };
  const checks = ['2026-10-08', '2026-10-09', '2026-10-10'].map((date) => ({
    ...metadata(`h:${date}`),
    habitId: 'h',
    date,
  }));
  it('当天尚未打卡仍保留截至昨天的连续天数', () => {
    expect(habitStreak(habit, checks, '2026-10-11')).toBe(3);
    expect(habitStreak(habit, checks, '2026-10-12')).toBe(0);
  });
  it('周目标按周统计连续数', () => {
    expect(
      habitStreak(
        { ...habit, frequency: 'weekly', weeklyGoal: 3 },
        checks,
        '2026-10-11',
      ),
    ).toBe(1);
  });
  it('完成率不计暂停习惯，不超过100%', () => {
    expect(habitWeekRate([habit], checks, '2026-10-11')).toBe(43);
    expect(
      habitWeekRate([{ ...habit, paused: true }], checks, '2026-10-11'),
    ).toBe(0);
    expect(
      habitWeekRate(
        [{ ...habit, frequency: 'weekly', weeklyGoal: 2 }],
        checks,
        '2026-10-11',
      ),
    ).toBe(100);
  });
});
