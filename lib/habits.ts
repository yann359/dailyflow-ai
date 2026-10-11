import type { Habit, HabitCheckIn } from './schemas';
import { addDays, dateDistance, weekStart } from './dates';
export function habitStreak(
  habit: Habit,
  checkIns: HabitCheckIn[],
  today: string,
) {
  const dates = new Set(
    checkIns
      .filter((c) => c.habitId === habit.id && !c.deletedAt)
      .map((c) => c.date),
  );
  if (habit.frequency === 'weekly') {
    let cursor = weekStart(today);
    let count = 0;
    const goal = habit.weeklyGoal;
    if ([...dates].filter((d) => weekStart(d) === cursor).length < goal)
      cursor = addDays(cursor, -7);
    for (let i = 0; i < 520; i++) {
      if ([...dates].filter((d) => weekStart(d) === cursor).length < goal)
        break;
      count++;
      cursor = addDays(cursor, -7);
    }
    return count;
  }
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (dates.has(cursor) && count < 36600) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}
export function habitWeekRate(
  habits: Habit[],
  checks: HabitCheckIn[],
  today: string,
) {
  const start = weekStart(today);
  const elapsed = dateDistance(today, start) + 1;
  let target = 0,
    done = 0;
  for (const habit of habits.filter((h) => !h.paused)) {
    const goal = habit.frequency === 'daily' ? elapsed : habit.weeklyGoal;
    target += goal;
    done += Math.min(
      goal,
      new Set(
        checks
          .filter(
            (c) =>
              c.habitId === habit.id &&
              c.date >= start &&
              c.date <= today &&
              !c.deletedAt,
          )
          .map((c) => c.date),
      ).size,
    );
  }
  return target ? Math.round((done / target) * 100) : 0;
}
