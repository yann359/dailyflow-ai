'use client';
import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Plus, Trash2, Pencil, ImageIcon } from 'lucide-react';
import { type Tables } from '@/lib/schemas';
import { recentDates, weekStart } from '@/lib/dates';
import { totalNutrition } from '@/lib/nutrition';
import { removeRecord } from '@/lib/db';
import { exercises } from '@/lib/workouts';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Empty, useAction, type Notify } from './shared';
export function TrendsTab({
  data,
  date,
  notify,
  onBody,
}: {
  data: Tables;
  date: string;
  notify: Notify;
  onBody: (id?: string) => void;
}) {
  const [metric, setMetric] = useState<'weight' | 'waist'>('weight');
  const [photo, setPhoto] = useState(false);
  const { run } = useAction(notify);
  const records = [...data.measurements].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const chart = records
    .filter((m) => m[metric] !== null)
    .map((m) => ({ date: m.date.slice(5), [metric]: m[metric] }));
  const last = records.at(-1);
  const dates = recentDates(date, 14);
  const nutrition = dates.map((d) => {
    const meals = data.meals.filter((m) => m.date === d);
    return {
      date: d.slice(5),
      protein: meals.length ? Math.round(totalNutrition(meals).protein) : null,
      calories: meals.length
        ? Math.round(totalNutrition(meals).calories)
        : null,
    };
  });
  const grouped = new Map<string, number[]>();
  for (const record of records) {
    const key = weekStart(record.date);
    grouped.set(key, [...(grouped.get(key) || []), record.weight]);
  }
  const averages = [...grouped].slice(-4);
  const exerciseNames = [...exercises.A, ...exercises.B].filter(
    (e, i, all) => all.findIndex((x) => x.id === e.id) === i,
  );
  const [exerciseId, setExerciseId] = useState('pushup');
  const strength = data.sessions
    .filter((s) => s.completed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const sets = data.sets.filter(
        (x) =>
          x.sessionId === s.id && x.exerciseId === exerciseId && x.completed,
      );
      return {
        date: s.date.slice(5),
        reps: sets.length ? Math.max(...sets.map((x) => x.reps)) : null,
        load: sets.length ? Math.max(...sets.map((x) => x.load)) : null,
      };
    })
    .filter((s) => s.reps !== null);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>看见一点点变化</h2>
          <p>一条记录，是起点；一段时间，才是趋势。</p>
        </div>
        <Button onClick={() => onBody()}>
          <Plus size={17} />
          记录身体数据
        </Button>
      </div>
      <div className="stats-grid">
        <div className="card stat">
          <span>最近一次体重</span>
          <b>
            {last?.weight ?? '—'}
            <small> kg</small>
          </b>
          <p>{last?.date || '还没有测量记录'}</p>
        </div>
        <div className="card stat">
          <span>最近一次腰围</span>
          <b>
            {last?.waist ?? '—'}
            <small> cm</small>
          </b>
          <p>在相近时间和位置测量</p>
        </div>
        <div className="card stat">
          <span>已完成的训练</span>
          <b>
            {data.sessions.filter((s) => s.completed).length}
            <small> 次</small>
          </b>
          <p>每一次努力都有记录</p>
        </div>
      </div>
      <section className="card chart-card">
        <div className="row between">
          <h3>身体变化</h3>
          <div className="segmented compact">
            <button
              className={metric === 'weight' ? 'active' : ''}
              onClick={() => setMetric('weight')}
            >
              体重
            </button>
            <button
              className={metric === 'waist' ? 'active' : ''}
              onClick={() => setMetric('waist')}
            >
              腰围
            </button>
          </div>
        </div>
        {chart.length < 2 ? (
          <Empty
            title="趋势需要再多一点记录"
            description={
              chart.length
                ? '已有1个数据点，再记录一次即可绘图。'
                : '测量并记录体重或腰围，图表就会从这里开始。'
            }
          />
        ) : (
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey={metric}
                  name={metric === 'weight' ? '体重 kg' : '腰围 cm'}
                  stroke="#668c6b"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="notice">
          图表仅展示真实测量值。短期波动很常见，不能据此判断减脂效果。
        </p>
        <div className="weekly-averages">
          {averages.map(([week, weights]) => (
            <div key={week}>
              <small>{week.slice(5)} 起的一周</small>
              <b>
                {(weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(
                  1,
                )}{' '}
                kg
              </b>
              <span>{weights.length} 次测量的平均值</span>
            </div>
          ))}
        </div>
      </section>
      <div className="two-col">
        <section className="card chart-card">
          <h3>近14天蛋白质</h3>
          {nutrition.filter((n) => n.protein !== null).length ? (
            <div className="chart small-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nutrition}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="date" interval={2} />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="protein"
                    name="蛋白质 g"
                    fill="#9bb995"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="还没有饮食数据"
              description="记录后展示当天已记录食物的蛋白质。"
            />
          )}
          <p className="notice">
            没有记录的日期保持空缺；记录不完整时不能代表全天摄入。
          </p>
        </section>
        <section className="card chart-card">
          <div className="row between">
            <h3>训练进步</h3>
            <select
              aria-label="趋势动作"
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
            >
              {exerciseNames.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          {strength.length < 2 ? (
            <Empty
              title="先积累几次训练"
              description="至少2次该动作的完成记录后，展示单组最高次数。"
            />
          ) : (
            <div className="chart small-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={strength}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    dataKey="reps"
                    name="单组最高次数 / 秒"
                    stroke="#b49b77"
                    strokeWidth={3}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="notice">比较相同动作时也要考虑姿势、负重和主观难度。</p>
        </section>
      </div>
      <section className="card">
        <div className="section-heading">
          <h3>测量记录</h3>
          <Button
            variant="ghost"
            disabled={!records.some((r) => r.photo)}
            onClick={() => setPhoto(true)}
          >
            <ImageIcon size={16} />
            查看本机照片
          </Button>
        </div>
        {!records.length ? (
          <Empty
            title="从今天开始认识身体"
            description="不会把档案的初始体重当作真实测量记录。"
          />
        ) : (
          [...records].reverse().map((m) => (
            <div className="record-row" key={m.id}>
              <span>
                <strong>{m.date}</strong>
                <small>{m.photo ? '包含私人照片 · 仅本机' : '身体测量'}</small>
              </span>
              <b>
                {m.weight} kg <small>{m.waist ? `/ ${m.waist} cm` : ''}</small>
              </b>
              <button
                className="icon-button"
                aria-label={`编辑${m.date}测量`}
                onClick={() => onBody(m.id)}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`删除${m.date}测量`}
                onClick={() =>
                  void run(async () => {
                    if (window.confirm('删除这条测量记录和它的本机照片？')) {
                      await removeRecord('measurements', m.id);
                      notify('测量已删除');
                    }
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </section>
      {photo && (
        <Dialog
          title="我的身体变化"
          description="这些照片只来自本机记录，没有发送给AI。"
          onClose={() => setPhoto(false)}
        >
          <div className="photo-comparison">
            {records
              .filter((r) => r.photo)
              .map((r) => (
                <figure key={r.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.photo!} alt={`${r.date}体型记录`} />
                  <figcaption>
                    {r.date} · {r.weight}kg
                  </figcaption>
                </figure>
              ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
