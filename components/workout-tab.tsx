'use client';
import { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Timer,
  Check,
  ChevronRight,
  RotateCcw,
  CalendarDays,
} from 'lucide-react';
import type { Tables } from '@/lib/schemas';
import { db, metadata, saveRecord, removeRecord } from '@/lib/db';
import {
  exercises,
  currentWorkout,
  schedule,
  trainingWeek,
  progression,
} from '@/lib/workouts';
import { displayDate, localDate, weekStart, addDays } from '@/lib/dates';
import { Button } from './ui/button';
import { useAction, type Notify } from './shared';
import { Dialog } from './ui/dialog';
export function WorkoutTab({
  data,
  date,
  notify,
}: {
  data: Tables;
  date: string;
  notify: Notify;
}) {
  const plan = data.plans[0];
  const today = currentWorkout(plan, date);
  const session = data.sessions.find((s) => s.date === date);
  const week = session?.week ?? trainingWeek(plan, date);
  const [type, setType] = useState<'A' | 'B'>(
    session?.type || today?.type || 'A',
  );
  const [detail, setDetail] = useState<string>();
  const { busy, run } = useAction(notify);
  const [remaining, setRemaining] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) setDeadline(null);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  const targetSets = week <= 2 ? 2 : 3;
  const list = exercises[type];
  const doneWeek = data.sessions.filter(
    (s) =>
      s.completed &&
      s.date >= weekStart(date) &&
      s.date <= addDays(weekStart(date), 6),
  ).length;
  async function saveWorkout(form: HTMLFormElement, finish: boolean) {
    await run(async () => {
      if (date > localDate(undefined, data.settings[0].timezone))
        throw new Error('不能记录未来训练');
      const fields = new FormData(form);
      const sid = session?.id || `${plan.id}:${date}`;
      const sets = list.flatMap((ex) =>
        Array.from({ length: targetSets }, (_, i) => ({
          ...metadata(`${sid}:${ex.id}:${i + 1}`),
          sessionId: sid,
          exerciseId: ex.id,
          order: i + 1,
          reps: Number(fields.get(`reps-${ex.id}-${i}`)),
          load: Number(fields.get(`load-${ex.id}-${i}`)),
          completed: fields.get(`done-${ex.id}-${i}`) === 'on',
        })),
      );
      if (finish && !sets.some((s) => s.completed && s.reps > 0))
        throw new Error('请至少记录并完成一组训练');
      await db.transaction(
        'rw',
        db.records.sessions,
        db.records.sets,
        db.outbox,
        async () => {
          await saveRecord('sessions', {
            ...(session || metadata(sid)),
            date,
            planId: plan.id,
            type,
            week,
            completed: finish,
          });
          for (const set of sets) await saveRecord('sets', set);
        },
      );
      notify(
        finish ? '今天的训练已记录，辛苦了' : '训练草稿已保存，可以稍后继续',
      );
    });
  }
  const selected = detail ? list.find((ex) => ex.id === detail) : undefined;
  return (
    <>
      <section className="workout-hero card">
        <div>
          <span className="eyebrow">YOUR 12-WEEK JOURNEY</span>
          <h2>
            慢慢练，
            <br />
            线条会慢慢出现。
          </h2>
          <p>居家 · 每周 3 次 · 全身力量</p>
          <div className="row wrap">
            <span className="pill">第 {week} / 12 周</span>
            <span className="pill">本周完成 {doneWeek} / 3 次</span>
            {plan.paused && <span className="pill">计划已暂停</span>}
          </div>
        </div>
        <div className="workout-art" aria-hidden="true">
          <div className="barbell">
            <i />
            <b />
            <i />
          </div>
          <span>build your own pace.</span>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <h2>
            {displayDate(date, { month: 'numeric', day: 'numeric' })} · 训练记录
          </h2>
          <p>
            {today
              ? `计划安排：训练 ${today.type}`
              : '今天可以休息，也可以按自己的节奏补录。'}
            {session?.completed ? ' · 已完成' : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await saveRecord('plans', { ...plan, paused: !plan.paused });
              notify(plan.paused ? '训练计划已恢复' : '训练计划已暂停');
            })
          }
        >
          {plan.paused ? <Play size={16} /> : <Pause size={16} />}{' '}
          {plan.paused ? '恢复计划' : '暂停计划'}
        </Button>
      </div>
      <div className="training-toolbar">
        <div className="segmented">
          <button
            disabled={!!session}
            className={type === 'A' ? 'active' : ''}
            onClick={() => setType('A')}
          >
            训练 A
          </button>
          <button
            disabled={!!session}
            className={type === 'B' ? 'active' : ''}
            onClick={() => setType('B')}
          >
            训练 B
          </button>
        </div>
        <div className="rest-timer">
          <Timer size={17} />
          <b>
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, '0')}
          </b>
          <Button
            variant="ghost"
            onClick={() => {
              setRemaining(60);
              setDeadline(Date.now() + 60000);
            }}
          >
            休息 60 秒
          </Button>
          {deadline ? (
            <button
              className="icon-button"
              aria-label="暂停倒计时"
              onClick={() => setDeadline(null)}
            >
              <Pause size={15} />
            </button>
          ) : (
            remaining > 0 && (
              <button
                className="icon-button"
                aria-label="继续倒计时"
                onClick={() => setDeadline(Date.now() + remaining * 1000)}
              >
                <Play size={15} />
              </button>
            )
          )}
        </div>
      </div>
      <p className="notice">
        前2周每个动作2组，之后3组。不必练到力竭，保留2–3次余力；疼痛或异常不适时停止训练，寻求适当帮助。
      </p>
      <form
        key={`${date}:${type}`}
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement;
          void saveWorkout(e.currentTarget, submitter.value === 'finish');
        }}
      >
        <div className="exercise-grid">
          {list.map((ex, index) => (
            <article className="exercise-card card" key={ex.id}>
              <div className="row between">
                <div className="row">
                  <span className="exercise-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{ex.name}</h3>
                    <p className="muted small">
                      {ex.muscle} · {ex.reps}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`查看${ex.name}动作说明`}
                  onClick={() => setDetail(ex.id)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="set-header">
                <span>组</span>
                <span>次数 / 秒</span>
                <span>负重 kg</span>
                <span>完成</span>
              </div>
              {Array.from({ length: targetSets }, (_, i) => {
                const old = data.sets.find(
                  (s) =>
                    s.sessionId === session?.id &&
                    s.exerciseId === ex.id &&
                    s.order === i + 1,
                );
                return (
                  <div className="set-row" key={i}>
                    <span>{i + 1}</span>
                    <input
                      aria-label={`${ex.name}第${i + 1}组次数`}
                      name={`reps-${ex.id}-${i}`}
                      type="number"
                      min="0"
                      max="300"
                      required
                      defaultValue={old?.reps ?? 0}
                    />
                    <input
                      aria-label={`${ex.name}第${i + 1}组负重`}
                      name={`load-${ex.id}-${i}`}
                      type="number"
                      step="0.1"
                      min="0"
                      max="300"
                      required
                      defaultValue={old?.load ?? 0}
                    />
                    <input
                      aria-label={`${ex.name}第${i + 1}组完成`}
                      name={`done-${ex.id}-${i}`}
                      type="checkbox"
                      defaultChecked={old?.completed ?? false}
                    />
                  </div>
                );
              })}
            </article>
          ))}
        </div>
        <div className="row wrap workout-actions">
          <Button
            type="submit"
            variant="secondary"
            value="draft"
            disabled={busy}
          >
            保存草稿
          </Button>
          <Button type="submit" value="finish" disabled={busy}>
            <Check size={17} />
            完成并保存训练
          </Button>
          {session && (
            <Button
              variant="ghost"
              onClick={() =>
                void run(async () => {
                  if (!window.confirm('删除当天训练及所有组记录？')) return;
                  await db.transaction(
                    'rw',
                    db.records.sessions,
                    db.records.sets,
                    db.outbox,
                    async () => {
                      for (const s of data.sets.filter(
                        (s) => s.sessionId === session.id,
                      ))
                        await removeRecord('sets', s.id);
                      await removeRecord('sessions', session.id);
                    },
                  );
                  notify('训练记录已删除');
                })
              }
            >
              <RotateCcw size={16} />
              删除当天记录
            </Button>
          )}
        </div>
      </form>
      <div className="card gentle-note">
        <h3>给下一次训练的小建议</h3>
        <p>{progression(data.sets, data.sessions)}</p>
      </div>
      <section className="card calendar-card">
        <div className="section-heading">
          <div>
            <h3>
              <CalendarDays size={17} />
              12 周计划
            </h3>
            <p>训练日期可在「我的」中调整，历史记录会保留。</p>
          </div>
        </div>
        <div className="plan-grid">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              className={`plan-week ${i + 1 === week ? 'current' : ''}`}
              key={i}
            >
              <b>W{String(i + 1).padStart(2, '0')}</b>
              {schedule(plan)
                .filter((s) => s.week === i + 1)
                .map((s) => (
                  <span
                    key={s.date}
                    title={`${s.date} · 训练${s.type}`}
                    className={
                      data.sessions.some(
                        (x) => x.date === s.date && x.completed,
                      )
                        ? 'completed'
                        : ''
                    }
                  >
                    {s.type}
                  </span>
                ))}
            </div>
          ))}
        </div>
      </section>
      {selected && (
        <Dialog
          title={selected.name}
          description={`${selected.muscle} · ${selected.reps}`}
          onClose={() => setDetail(undefined)}
        >
          <h3>动作步骤</h3>
          <p className="detail-copy">{selected.steps}</p>
          <h3>注意事项</h3>
          <p className="notice">{selected.caution}</p>
          <Button className="full" onClick={() => setDetail(undefined)}>
            知道了
          </Button>
        </Dialog>
      )}
    </>
  );
}
