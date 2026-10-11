import { addDays, dateDistance, dayOfWeek } from './dates';
import type { WorkoutPlan, ExerciseSet, WorkoutSession } from './schemas';
export type Exercise = {
  id: string;
  name: string;
  muscle: string;
  reps: string;
  steps: string;
  caution: string;
};
export const exercises: Record<'A' | 'B', Exercise[]> = {
  A: [
    {
      id: 'pushup',
      name: '俯卧撑',
      muscle: '胸部 · 肱三头肌',
      reps: '6–12 次',
      steps: '双手略宽于肩，收紧腹部，身体保持直线。缓慢下降，再呼气推起。',
      caution: '可从墙壁或高台俯卧撑开始；肩部不适立即停止。',
    },
    {
      id: 'row',
      name: '背包俯身划船',
      muscle: '背部',
      reps: '8–12 次',
      steps: '背包拉链扣紧，髋部后移，保持背部自然平直。肘部向后，拉向腰侧。',
      caution: '避免耸肩或弓背，用稳定可控的轻负重。',
    },
    {
      id: 'squat',
      name: '深蹲',
      muscle: '股四头肌 · 臀部',
      reps: '10–15 次',
      steps: '双脚约肩宽，髋膝同时弯曲，下蹲至舒适深度，再平稳站起。',
      caution: '膝盖方向与脚尖一致，不追求过深幅度。',
    },
    {
      id: 'rdl',
      name: '罗马尼亚硬拉',
      muscle: '臀部 · 大腿后侧',
      reps: '8–12 次',
      steps: '握住背包，微屈膝，髋部向后移动，感受腿后侧拉伸后站起。',
      caution: '保持背部自然平直，避免用腰部拉起。',
    },
    {
      id: 'lateral',
      name: '水瓶侧平举',
      muscle: '肩部',
      reps: '10–15 次',
      steps: '握轻水瓶，肘微屈，双臂向两侧抬至肩高，缓慢放下。',
      caution: '不借助身体摆动，不超过肩高。',
    },
    {
      id: 'curl',
      name: '水瓶弯举',
      muscle: '肱二头肌',
      reps: '10–15 次',
      steps: '上臂贴近身体，弯曲肘部抬起水瓶，再控制下降。',
      caution: '手腕保持中立，避免耸肩。',
    },
    {
      id: 'plank',
      name: '平板支撑',
      muscle: '核心',
      reps: '20–40 秒',
      steps: '前臂支撑，肘在肩下方，腹部收紧，保持自然呼吸。',
      caution: '腰部不要塌陷，姿势变形时提前结束。',
    },
  ],
  B: [
    {
      id: 'lunge',
      name: '反向弓步蹲',
      muscle: '臀腿',
      reps: '每侧 8–12 次',
      steps: '一脚向后迈步，垂直下蹲，再由前脚发力站起。左右交替。',
      caution: '可扶墙保持平衡，膝部疼痛时停止。',
    },
    {
      id: 'incline',
      name: '上斜俯卧撑',
      muscle: '胸部 · 肱三头肌',
      reps: '8–12 次',
      steps: '双手撑稳定高台，身体保持直线，胸部向台面靠近后推起。',
      caution: '家具必须稳固，逐步降低高台高度。',
    },
    {
      id: 'single-row',
      name: '单臂背包划船',
      muscle: '背部',
      reps: '每侧 8–12 次',
      steps: '一手撑稳固桌面，另一手将背包拉向髋部，缓慢放下。',
      caution: '保持躯干稳定，不扭转腰部。',
    },
    {
      id: 'press',
      name: '水瓶肩推',
      muscle: '肩部',
      reps: '8–12 次',
      steps: '水瓶在肩侧，腹部收紧，向上推至舒适高度，缓慢放回。',
      caution: '不向后过度弓腰，肩部不适停止。',
    },
    {
      id: 'bridge',
      name: '臀桥',
      muscle: '臀部',
      reps: '12–15 次',
      steps: '仰卧屈膝，脚踩地，收紧臀部抬起髋部，再缓慢下降。',
      caution: '避免用腰部过度挺起。',
    },
    {
      id: 'extension',
      name: '水瓶臂屈伸',
      muscle: '肱三头肌',
      reps: '10–12 次',
      steps: '双手握轻水瓶，抬至头顶，缓慢弯肘再伸直。',
      caution: '肘部保持稳定，肩肘疼痛时停止。',
    },
    {
      id: 'deadbug',
      name: '死虫式',
      muscle: '核心',
      reps: '每侧 6–10 次',
      steps: '仰卧，抬起双臂和屈膝双腿，对侧手脚缓慢伸展再收回。',
      caution: '腰背保持舒适贴地，减少伸展幅度避免代偿。',
    },
  ],
};
export function schedule(plan: WorkoutPlan) {
  const dates = Array.from({ length: 84 }, (_, offset) =>
    addDays(plan.startDate, offset),
  ).filter((date) => plan.days.includes(dayOfWeek(date)));
  return dates.map((date, index) => {
    const week = Math.floor(dateDistance(date, plan.startDate) / 7) + 1;
    return {
      date,
      week,
      type: (index % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
      sets: week <= 2 ? 2 : 3,
    };
  });
}
export function currentWorkout(plan: WorkoutPlan, date: string) {
  if (plan.paused) return null;
  return schedule(plan).find((s) => s.date === date) ?? null;
}
export function trainingWeek(plan: WorkoutPlan, date: string) {
  return Math.max(
    1,
    Math.min(12, Math.floor(dateDistance(date, plan.startDate) / 7) + 1),
  );
}
export function progression(sets: ExerciseSet[], sessions: WorkoutSession[]) {
  const completed = new Set(
    sessions.filter((s) => s.completed).map((s) => s.id),
  );
  const actual = sets.filter((s) => s.completed && completed.has(s.sessionId));
  return completed.size >= 2 && actual.length >= 12
    ? '如果所有组动作稳定且还可再做 2 次，下次只增加 1–2 次重复或少量负重。'
    : '先以动作稳定为目标，保留 2–3 次余力；记录几次训练后再评估难度。';
}
export function isTrainingDay(plan: WorkoutPlan, date: string) {
  return plan.days.includes(dayOfWeek(date));
}
