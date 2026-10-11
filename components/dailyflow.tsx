'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Leaf,
  House,
  Utensils,
  Dumbbell,
  ChartNoAxesCombined,
  UserRound,
  Plus,
  ArrowUpRight,
  Check,
  ChevronRight,
  CalendarDays,
  Sparkles,
  BookOpen,
  Droplets,
  Moon,
  Footprints,
  Star,
  Trash2,
  Pencil,
  CheckCheck,
  Settings2,
  WifiOff,
  Pause,
  Play,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  db,
  initializeDB,
  loadData,
  saveRecord,
  removeRecord,
  toggleHabit,
} from '@/lib/db';
import { totalNutrition, mealLabels } from '@/lib/nutrition';
import {
  localDate,
  displayDate,
  weekStart,
  addDays,
  dayOfWeek,
} from '@/lib/dates';
import { currentWorkout, trainingWeek } from '@/lib/workouts';
import { habitWeekRate, habitStreak } from '@/lib/habits';
import type { Tables } from '@/lib/schemas';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Empty, MiniBar, useAction, type Notify } from './shared';
import {
  MealDialog,
  FoodDialog,
  HabitDialog,
  BodyDialog,
  AddFoodButton,
} from './record-dialogs';
import { WorkoutTab } from './workout-tab';
import { TrendsTab } from './trends-tab';
import { SettingsTab, type AIStatus } from './settings-tab';
import { CoachDialog } from './coach-dialog';
type Tab = 'home' | 'meals' | 'workouts' | 'trends' | 'settings';
type Modal =
  | { kind: 'meal'; id?: string }
  | { kind: 'food'; id?: string }
  | { kind: 'habit'; id?: string }
  | { kind: 'body'; id?: string }
  | { kind: 'habits' }
  | { kind: 'coach' };
const navigation = [
  { id: 'home', name: '今日概览', mobile: '首页', icon: House },
  { id: 'meals', name: '饮食记录', mobile: '饮食', icon: Utensils },
  { id: 'workouts', name: '居家训练', mobile: '训练', icon: Dumbbell },
  { id: 'trends', name: '身体趋势', mobile: '趋势', icon: ChartNoAxesCombined },
  { id: 'settings', name: '我的空间', mobile: '我的', icon: UserRound },
] as const;
const habitIcons = {
  water: Droplets,
  book: BookOpen,
  moon: Moon,
  walk: Footprints,
  spark: Sparkles,
};
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const subscribeNavigation = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};
const tabSnapshot = (): Tab => {
  const active = window.location.hash.slice(1);
  return navigation.some((n) => n.id === active) ? (active as Tab) : 'home';
};
const subscribeOnline = (callback: () => void) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};
export default function DailyFlow() {
  const tab = useSyncExternalStore(
    subscribeNavigation,
    tabSnapshot,
    () => 'home' as Tab,
  );
  const browserOffline = useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );
  const [date, setDate] = useState(() => localDate());
  const [modal, setModal] = useState<Modal>();
  const [toast, setToast] = useState('');
  const [code, setCode] = useState('');
  const [connectionLost, setConnectionLost] = useState(false);
  const offline = browserOffline || connectionLost;
  const [installEvent, setInstallEvent] = useState<InstallEvent>();
  const [aiStatus, setAIStatus] = useState<AIStatus>({
    enabled: false,
    reason: 'AI服务未配置，本地功能正常可用',
    provider: 'none',
  });
  const reduced = useReducedMotion();
  const [databaseReady, setDatabaseReady] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    initializeDB()
      .then(() => {
        if (active) setDatabaseReady(true);
      })
      .catch((error) => {
        if (active)
          setInitializationError(
            error instanceof Error ? error.message : '本地数据库无法打开',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  const query = useLiveQuery(async () => {
    if (!databaseReady) return undefined;
    try {
      return { data: await loadData(), error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : '本地数据库无法打开',
      };
    }
  }, [databaseReady]);
  const data = query?.data;
  const databaseError = initializationError || query?.error;
  useEffect(() => {
    const install = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', install);
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(() => setToast('离线缓存未就绪，可继续正常使用'));
    }
    const checkConnection = () => {
      fetch('/api/ai', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
        .then((r) => r.json())
        .then((status) => {
          setConnectionLost(false);
          setAIStatus(status);
        })
        .catch(() => {
          setConnectionLost(true);
          setAIStatus({
            enabled: false,
            provider: 'none',
            reason: 'AI服务暂不可连接，继续使用本地功能',
          });
        });
    };
    checkConnection();
    window.addEventListener('online', checkConnection);
    return () => {
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('online', checkConnection);
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        data.settings[0].theme === 'dark' ||
          (data.settings[0].theme === 'system' && media.matches),
      );
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [data]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify: Notify = (message) => setToast(message);
  const navigate = (next: Tab) => {
    window.history.replaceState(null, '', `#${next}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
  };
  async function install() {
    if (installEvent) {
      await installEvent.prompt();
      setInstallEvent(undefined);
    } else
      notify(
        'iPhone：Safari分享按钮 → 添加到主屏幕；安卓：浏览器菜单 → 安装应用。需HTTPS或localhost。',
      );
  }
  if (!data)
    return (
      <main className="loading-page">
        <div className="brand-mark">
          <Leaf size={32} />
        </div>
        <h1>
          轻律 <span>DailyFlow AI</span>
        </h1>
        {databaseError ? (
          <>
            <p>本地数据未能打开：{databaseError}</p>
            <p>请确认浏览器允许网站存储；不要清除已有记录。</p>
            <Button onClick={() => window.location.reload()}>重新尝试</Button>
          </>
        ) : (
          <>
            <p>正在打开你的生活记录…</p>
            <div className="loading-bar" />
          </>
        )}
      </main>
    );
  const today = localDate(undefined, data.settings[0].timezone);
  const aiReady =
    aiStatus.enabled && data.settings[0].aiEnabled && !!code && !offline;
  const current = navigation.find((n) => n.id === tab)!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#home"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate('home');
          }}
        >
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          <span>
            <b>轻律</b>
            <small>DAILYFLOW AI</small>
          </span>
        </a>
        <div className="sidebar-label">我的日常</div>
        <nav aria-label="主导航">
          {navigation.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? 'nav-item active' : 'nav-item'}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={20} />
              <span>{name}</span>
              {tab === id && <i />}
            </button>
          ))}
        </nav>
        <button
          className="sidebar-coach"
          onClick={() => setModal({ kind: 'coach' })}
        >
          <span>
            <Sparkles size={19} />
          </span>
          <b>你的轻律教练</b>
          <small>一点建议，刚刚好。</small>
          <ArrowUpRight size={17} />
        </button>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={15} />
            <span>记录留在你的设备</span>
          </div>
          <div className="user-block">
            <span className="user-avatar">
              {data.profiles[0].name.slice(0, 1)}
            </span>
            <div>
              <b>{data.profiles[0].name}</b>
              <small>找到自己的节奏</small>
            </div>
            <button
              className="icon-button"
              aria-label="打开设置"
              onClick={() => navigate('settings')}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">
              <Leaf size={19} />
            </span>
            <b>轻律</b>
          </div>
          <div className="breadcrumb">
            <span>我的空间</span>
            <ChevronRight size={14} />
            <b>{current.name}</b>
          </div>
          <div className="topbar-actions">
            <span className="local-status">
              {offline ? <WifiOff size={13} /> : <i />}
              {offline ? '离线 · 本机可用' : '本地模式'}
            </span>
            <button
              className="icon-button topbar-ai"
              aria-label="打开AI教练"
              onClick={() => setModal({ kind: 'coach' })}
            >
              <Sparkles size={18} />
            </button>
          </div>
        </header>
        <main className="main-content" id="main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tab === 'home'
                  ? 'MAKE ROOM FOR A BETTER YOU'
                  : 'YOUR OWN PACE'}
              </span>
              <h1>
                {tab === 'home' ? '今天，也好好照顾自己。' : current.name}
              </h1>
              <p>
                {tab === 'home'
                  ? '不用一下子变得完美。做一点，就很好。'
                  : tab === 'meals'
                    ? '好好吃饭，给身体足够的能量。'
                    : tab === 'workouts'
                      ? '把每一次小小的坚持，练成自己的力量。'
                      : tab === 'trends'
                        ? '看长一点，让变化自然发生。'
                        : '按你的习惯，设置自己的轻律。'}
              </p>
            </div>
            {tab !== 'settings' && (
              <label className="date-picker">
                <CalendarDays size={16} />
                <input
                  aria-label="查看日期"
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
              </label>
            )}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="page-stack"
            >
              {tab === 'home' && (
                <Home
                  data={data}
                  date={date}
                  setDate={setDate}
                  today={today}
                  notify={notify}
                  onModal={setModal}
                  navigate={navigate}
                />
              )}
              {tab === 'meals' && (
                <MealsTab
                  data={data}
                  date={date}
                  notify={notify}
                  onModal={setModal}
                />
              )}
              {tab === 'workouts' && (
                <WorkoutTab
                  key={`${date}:${data.plans[0].updatedAt}`}
                  data={data}
                  date={date}
                  notify={notify}
                />
              )}
              {tab === 'trends' && (
                <TrendsTab
                  data={data}
                  date={date}
                  notify={notify}
                  onBody={(id) => setModal({ kind: 'body', id })}
                />
              )}
              {tab === 'settings' && (
                <SettingsTab
                  key={`${data.profiles[0].updatedAt}:${data.targets[0].updatedAt}:${data.plans[0].updatedAt}`}
                  data={data}
                  notify={notify}
                  aiStatus={aiStatus}
                  code={code}
                  setCode={setCode}
                  onInstall={() => void install()}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="手机导航">
        {navigation.map(({ id, mobile, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => navigate(id)}
          >
            <Icon size={21} />
            <span>{mobile}</span>
          </button>
        ))}
      </nav>
      {modal?.kind === 'meal' && (
        <MealDialog
          data={data}
          date={date}
          notify={notify}
          onClose={() => setModal(undefined)}
          entry={data.meals.find((m) => m.id === modal.id)}
          aiReady={aiReady}
          code={code}
        />
      )}
      {modal?.kind === 'food' && (
        <FoodDialog
          data={data}
          notify={notify}
          onClose={() => setModal(undefined)}
          food={data.foods.find((f) => f.id === modal.id)}
          aiReady={aiReady}
          code={code}
        />
      )}
      {modal?.kind === 'habit' && (
        <HabitDialog
          notify={notify}
          onClose={() => setModal(undefined)}
          habit={data.habits.find((h) => h.id === modal.id)}
        />
      )}
      {modal?.kind === 'body' && (
        <BodyDialog
          data={data}
          date={date}
          notify={notify}
          onClose={() => setModal(undefined)}
          measurement={data.measurements.find((m) => m.id === modal.id)}
        />
      )}
      {modal?.kind === 'habits' && (
        <HabitsPanel
          data={data}
          date={date}
          today={today}
          notify={notify}
          onClose={() => setModal(undefined)}
          edit={(id) => setModal({ kind: 'habit', id })}
        />
      )}
      {modal?.kind === 'coach' && (
        <CoachDialog
          data={data}
          date={date}
          notify={notify}
          onClose={() => setModal(undefined)}
          aiReady={aiReady}
          code={code}
        />
      )}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={reduced ? false : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <CheckCheck size={18} />
            <span>{toast}</span>
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => setToast('')}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
function Home({
  data,
  date,
  setDate,
  today,
  notify,
  onModal,
  navigate,
}: {
  data: Tables;
  date: string;
  setDate: (d: string) => void;
  today: string;
  notify: Notify;
  onModal: (m: Modal) => void;
  navigate: (tab: Tab) => void;
}) {
  const meals = data.meals.filter((m) => m.date === date);
  const total = totalNutrition(meals);
  const target = data.targets[0];
  const plan = data.plans[0];
  const workout = currentWorkout(plan, date);
  const doneWorkout = data.sessions.some((s) => s.date === date && s.completed);
  const active = data.habits.filter((h) => !h.paused);
  const checked = data.checkIns.filter((c) => c.date === date);
  const { run } = useAction(notify);
  const hidden = data.settings[0].hiddenModules;
  const week = weekStart(date);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const completedMeals = new Set(meals.map((m) => m.meal)).size;
  const rate = habitWeekRate(data.habits, data.checkIns, date);
  const proteinPercent = Math.min(100, (total.protein / target.protein) * 100);
  const weekWorkout = data.sessions.filter(
    (s) => s.completed && s.date >= week && s.date <= addDays(week, 6),
  ).length;
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <span className="pill">
            <span className="sun-dot" />
            {displayDate(date)}
          </span>
          <h2>
            找到节奏，
            <br />
            让改变<span>慢慢发生。</span>
          </h2>
          <p>
            认真吃饭，轻松运动，好好生活。
            <br />
            你的每一小步，都算数。
          </p>
          <Button onClick={() => onModal({ kind: 'meal' })}>
            <Plus size={17} />
            记录我的一餐
            <ArrowUpRight size={16} />
          </Button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="sculpture">
            <i className="petal petal-one" />
            <i className="petal petal-two" />
            <i className="petal petal-three" />
            <i className="petal petal-four" />
            <div className="sculpture-core" />
          </div>
          <div className="hero-art-label">
            <span>small steps.</span>
            <b>lasting change.</b>
          </div>
        </div>
        <span className="hero-index">01 / YOUR DAILY FLOW</span>
      </section>
      <div className="week-strip card">
        <div className="week-label">
          <b>这一周</b>
          <span>按自己的节奏</span>
        </div>
        {dates.map((d) => {
          const done = data.checkIns.filter(
            (c) => c.date === d && active.some((h) => h.id === c.habitId),
          ).length;
          return (
            <button
              key={d}
              className={`${date === d ? 'selected' : ''} ${d === today ? 'today' : ''}`}
              disabled={d > today}
              onClick={() => setDate(d)}
            >
              <small>
                {['日', '一', '二', '三', '四', '五', '六'][dayOfWeek(d)]}
              </small>
              <b>{Number(d.slice(8))}</b>
              <i className={done ? 'has-record' : ''} />
            </button>
          );
        })}
      </div>
      <div className="dashboard-grid">
        {!hidden.includes('nutrition') && (
          <section className="card nutrition-card">
            <div className="section-heading">
              <h3>今日营养</h3>
              <button className="text-button" onClick={() => navigate('meals')}>
                查看饮食
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="nutrition-overview">
              <div
                className="protein-ring"
                style={
                  { '--progress': `${proteinPercent}%` } as React.CSSProperties
                }
              >
                <div>
                  <small>蛋白质摄入</small>
                  <b>
                    {Math.round(total.protein)}
                    <span>g</span>
                  </b>
                  <small>/ {target.protein}g 目标</small>
                </div>
              </div>
              <div className="macro-list">
                <div>
                  <span>
                    <i className="macro-dot green" />
                    热量
                  </span>
                  <b>
                    {Math.round(total.calories)}{' '}
                    <small>/ {target.calories} kcal</small>
                  </b>
                  <MiniBar value={total.calories} max={target.calories} />
                </div>
                <div>
                  <span>
                    <i className="macro-dot gold" />
                    碳水
                  </span>
                  <b>
                    {Math.round(total.carbs)} <small>/ {target.carbs} g</small>
                  </b>
                  <MiniBar
                    value={total.carbs}
                    max={target.carbs}
                    color="gold"
                  />
                </div>
                <div>
                  <span>
                    <i className="macro-dot rose" />
                    脂肪
                  </span>
                  <b>
                    {Math.round(total.fat)} <small>/ {target.fat} g</small>
                  </b>
                  <MiniBar value={total.fat} max={target.fat} color="rose" />
                </div>
              </div>
            </div>
            <div className="nutrition-foot">
              <Utensils size={14} />
              {completedMeals
                ? '已记录 ' + completedMeals + ' 个餐次 · 营养值为记录内估算'
                : '还没有记录，从下一餐开始就好。'}
            </div>
          </section>
        )}
        {!hidden.includes('workout') && (
          <section className="card today-workout">
            <div className="section-heading">
              <h3>今天，动一动</h3>
              <span className="tag">第 {trainingWeek(plan, date)} 周</span>
            </div>
            <div className="workout-symbol">
              <Dumbbell size={38} strokeWidth={1.5} />
              <span className="little-star">✦</span>
            </div>
            <h2>
              {doneWorkout
                ? '今天的训练，完成了'
                : workout
                  ? `全身力量 · 训练 ${workout.type}`
                  : plan.paused
                    ? '慢下来，休息一下'
                    : '今天是恢复日'}
            </h2>
            <p>
              {doneWorkout
                ? '给认真行动的自己一点肯定。'
                : workout
                  ? `${trainingWeek(plan, date) <= 2 ? '适应阶段 · 每动作2组' : '渐进阶段 · 每动作3组'} · 背包 / 水瓶 / 自重`
                  : '散步、舒展或好好休息，都是照顾自己。'}
            </p>
            <Button variant="secondary" onClick={() => navigate('workouts')}>
              {doneWorkout
                ? '查看训练记录'
                : workout
                  ? '开始今天的训练'
                  : '查看我的训练计划'}
              <ArrowUpRight size={17} />
            </Button>
          </section>
        )}
        {!hidden.includes('habits') && (
          <section className="card habits-card">
            <div className="section-heading">
              <h3>
                给生活一点好习惯{' '}
                <span className="count-label">
                  {
                    checked.filter((c) =>
                      active.some((h) => h.id === c.habitId),
                    ).length
                  }
                  /{active.length}
                </span>
              </h3>
              <button
                className="text-button"
                onClick={() => onModal({ kind: 'habits' })}
              >
                管理
                <Settings2 size={14} />
              </button>
            </div>
            {!active.length ? (
              <Empty
                title="一个小习惯就够了"
                description="从喝水、阅读或散步开始。"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => onModal({ kind: 'habit' })}
                  >
                    添加习惯
                  </Button>
                }
              />
            ) : (
              active.map((habit) => {
                const Icon = habitIcons[habit.icon];
                const done = checked.some((c) => c.habitId === habit.id);
                const streak = habitStreak(habit, data.checkIns, date);
                return (
                  <div className="habit-row" key={habit.id}>
                    <span className={`habit-icon ${habit.icon}`}>
                      <Icon size={20} />
                    </span>
                    <div>
                      <b>{habit.name}</b>
                      <p>
                        {habit.frequency === 'daily'
                          ? '每日小习惯'
                          : `每周 ${habit.weeklyGoal} 天`}
                        {streak > 0
                          ? ` · 连续 ${streak} ${habit.frequency === 'weekly' ? '周' : '天'}`
                          : ' · 每天都是新的开始'}
                      </p>
                    </div>
                    <button
                      disabled={date > today}
                      className={`habit-check ${done ? 'checked' : ''}`}
                      aria-label={`${done ? '取消' : '完成'}${habit.name}`}
                      aria-pressed={done}
                      onClick={() =>
                        void run(async () => {
                          await toggleHabit(habit.id, date);
                          notify(
                            done ? '已取消当天打卡' : '小小的坚持，已记下',
                          );
                        })
                      }
                    >
                      <Check size={18} />
                    </button>
                  </div>
                );
              })
            )}
            <button
              className="add-habit"
              onClick={() => onModal({ kind: 'habit' })}
            >
              <Plus size={15} />
              添加一个小习惯
            </button>
          </section>
        )}
        {!hidden.includes('week') && (
          <section className="card week-card">
            <div className="section-heading">
              <h3>本周的小进步</h3>
              <span className="tag">真实记录</span>
            </div>
            <div className="week-stats">
              <div>
                <span className="metric-icon">
                  <Dumbbell size={20} />
                </span>
                <b>
                  {weekWorkout}
                  <small> / 3</small>
                </b>
                <span>训练完成</span>
              </div>
              <div>
                <span className="metric-icon gold">
                  <CheckCheck size={20} />
                </span>
                <b>
                  {rate}
                  <small>%</small>
                </b>
                <span>习惯完成率</span>
              </div>
            </div>
            <MiniBar value={rate} max={100} />
            <p>截至当前日期统计。每周目标未达成，也不影响重新开始。</p>
            <button
              className="text-button"
              onClick={() => onModal({ kind: 'coach' })}
            >
              看看我的7天复盘
              <ArrowUpRight size={16} />
            </button>
          </section>
        )}
      </div>
      <button
        className="coach-banner"
        onClick={() => onModal({ kind: 'coach' })}
      >
        <span className="coach-banner-icon">
          <Sparkles size={26} />
        </span>
        <div>
          <span className="eyebrow">A LITTLE GUIDANCE</span>
          <h3>不必一个人摸索。</h3>
          <p>
            {meals.length
              ? `记录内蛋白质约 ${total.protein.toFixed(1)}g。完整记录，会让建议更有依据。`
              : '先记录今天的一餐。让建议从真实的生活开始。'}{' '}
            · 本地规则提示
          </p>
        </div>
        <span className="coach-banner-action">
          聊聊今天
          <ArrowUpRight size={18} />
        </span>
      </button>
      <footer className="page-footer">
        把生活过轻一点。<span>Every small step counts.</span>
      </footer>
    </>
  );
}
function MealsTab({
  data,
  date,
  notify,
  onModal,
}: {
  data: Tables;
  date: string;
  notify: Notify;
  onModal: (m: Modal) => void;
}) {
  const meals = data.meals.filter((m) => m.date === date);
  const total = totalNutrition(meals);
  const { run } = useAction(notify);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>这一天的饮食</h2>
          <p>{displayDate(date)} · 数据来自已保存记录</p>
        </div>
        <Button onClick={() => onModal({ kind: 'meal' })}>
          <Plus size={17} />
          记录一餐
        </Button>
      </div>
      <div className="stats-grid four">
        {(
          [
            { key: 'calories', label: '热量', unit: 'kcal' },
            { key: 'protein', label: '蛋白质', unit: 'g' },
            { key: 'carbs', label: '碳水', unit: 'g' },
            { key: 'fat', label: '脂肪', unit: 'g' },
          ] as const
        ).map(({ key, label, unit }) => (
          <div className="card stat" key={key}>
            <span>{label}</span>
            <b>
              {Math.round(total[key])}
              <small> {unit}</small>
            </b>
            <MiniBar value={total[key]} max={data.targets[0][key]} />
            <p>
              目标 {data.targets[0][key]} {unit}
            </p>
          </div>
        ))}
      </div>
      <div className="meal-grid">
        {Object.entries(mealLabels).map(([key, label], index) => {
          const entries = meals.filter((m) => m.meal === key);
          return (
            <section className="card meal-card" key={key}>
              <div className="section-heading">
                <h3>
                  <span className={`meal-icon meal-${index}`}>
                    <Utensils size={18} />
                  </span>
                  {label}
                </h3>
                <span className="muted small">
                  {entries.length
                    ? `${Math.round(totalNutrition(entries).calories)} kcal`
                    : '未记录'}
                </span>
              </div>
              {!entries.length ? (
                <div className="meal-empty">
                  这一餐还没有记录<span>吃完随手记一下就好。</span>
                </div>
              ) : (
                entries.map((m) => (
                  <div className="record-row" key={m.id}>
                    <span>
                      <strong>{m.foodName}</strong>
                      <small>
                        {m.amount}
                        {m.unit} · 蛋白质 {m.nutrition.protein.toFixed(1)}g
                      </small>
                    </span>
                    <b>
                      {Math.round(m.nutrition.calories)}
                      <small> kcal</small>
                    </b>
                    <button
                      className="icon-button"
                      aria-label={`编辑${m.foodName}记录`}
                      onClick={() => onModal({ kind: 'meal', id: m.id })}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`删除${m.foodName}记录`}
                      onClick={() =>
                        void run(async () => {
                          if (window.confirm('删除这条饮食记录？')) {
                            await removeRecord('meals', m.id);
                            notify('饮食记录已删除');
                          }
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </section>
          );
        })}
      </div>
      <section className="card food-library">
        <div className="section-heading">
          <div>
            <h3>我的食物库</h3>
            <p>内置数据为参考值，自定义食物以你的包装标签为准。</p>
          </div>
          <AddFoodButton onClick={() => onModal({ kind: 'food' })} />
        </div>
        <div className="food-grid">
          {[...data.foods]
            .sort((a, b) => Number(b.favorite) - Number(a.favorite))
            .map((food) => (
              <div className="food-item" key={food.id}>
                <div className="row between">
                  <b>{food.name}</b>
                  <button
                    className={`icon-button ${food.favorite ? 'favorite' : ''}`}
                    aria-label={`${food.favorite ? '取消收藏' : '收藏'}${food.name}`}
                    onClick={() =>
                      void run(async () => {
                        await saveRecord('foods', {
                          ...food,
                          favorite: !food.favorite,
                        });
                      })
                    }
                  >
                    <Star
                      size={17}
                      fill={food.favorite ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
                <p>
                  每100{food.unit} · {food.nutrition.calories} kcal
                </p>
                <span>蛋白质 {food.nutrition.protein}g</span>
                <small className="food-source">{food.source}</small>
                <div className="row">
                  <Button
                    variant="ghost"
                    onClick={() => onModal({ kind: 'food', id: food.id })}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void run(async () => {
                        if (
                          window.confirm(
                            `从食物库删除“${food.name}”？历史饮食记录仍保留。`,
                          )
                        ) {
                          await removeRecord('foods', food.id);
                          notify('食物已从库中移除');
                        }
                      })
                    }
                  >
                    移除
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </section>
      <p className="notice">
        营养信息属于参考或估算。不同品牌、食用部位和烹饪方法会带来差异。
      </p>
    </>
  );
}
function HabitsPanel({
  data,
  date,
  today,
  notify,
  onClose,
  edit,
}: {
  data: Tables;
  date: string;
  today: string;
  notify: Notify;
  onClose: () => void;
  edit: (id?: string) => void;
}) {
  const [selected, setSelected] = useState(data.habits[0]?.id || '');
  const [month, setMonth] = useState(date.slice(0, 7));
  const { run } = useAction(notify);
  const first = `${month}-01`;
  const cursor = new Date(`${first}T12:00:00Z`);
  const dayCount = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const offset = (dayOfWeek(first) + 6) % 7;
  const selectedHabit = data.habits.find((h) => h.id === selected);
  return (
    <Dialog
      title="我的好习惯"
      description="查看日历、补录或调整习惯。暂停和中断都不会受到惩罚。"
      onClose={onClose}
    >
      <div className="habit-manager">
        {data.habits.map((h) => {
          const Icon = habitIcons[h.icon];
          return (
            <div className={`habit-row ${h.paused ? 'paused' : ''}`} key={h.id}>
              <span className={`habit-icon ${h.icon}`}>
                <Icon size={18} />
              </span>
              <button
                className="habit-select"
                onClick={() => setSelected(h.id)}
              >
                <b>{h.name}</b>
                <small>
                  {h.paused
                    ? '已暂停'
                    : h.frequency === 'daily'
                      ? '每日'
                      : `每周${h.weeklyGoal}天`}
                </small>
              </button>
              <button
                className="icon-button"
                aria-label={`编辑${h.name}`}
                onClick={() => edit(h.id)}
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`${h.paused ? '恢复' : '暂停'}${h.name}`}
                onClick={() =>
                  void run(async () => {
                    await saveRecord('habits', { ...h, paused: !h.paused });
                  })
                }
              >
                {h.paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button
                className="icon-button"
                aria-label={`删除${h.name}`}
                onClick={() =>
                  void run(async () => {
                    if (!window.confirm(`删除“${h.name}”及其打卡记录？`))
                      return;
                    await db.transaction(
                      'rw',
                      db.records.habits,
                      db.records.checkIns,
                      db.outbox,
                      async () => {
                        for (const c of data.checkIns.filter(
                          (c) => c.habitId === h.id,
                        ))
                          await removeRecord('checkIns', c.id);
                        await removeRecord('habits', h.id);
                      },
                    );
                    notify('习惯已删除');
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <Button variant="secondary" onClick={() => edit()}>
        <Plus size={16} />
        添加习惯
      </Button>
      {selectedHabit && (
        <section className="habit-calendar">
          <div className="row between">
            <h3>{selectedHabit.name}</h3>
            <input
              aria-label="习惯月份"
              type="month"
              value={month}
              max={today.slice(0, 7)}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </div>
          <div className="calendar-grid">
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <span key={day}>{day}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <i key={`blank-${i}`} />
            ))}
            {Array.from({ length: dayCount }, (_, i) => {
              const d = addDays(first, i);
              const done = data.checkIns.some(
                (c) => c.habitId === selected && c.date === d,
              );
              return (
                <button
                  key={d}
                  className={done ? 'done' : ''}
                  disabled={d > today || selectedHabit.paused}
                  aria-label={`${d}${done ? '取消打卡' : '补录打卡'}`}
                  aria-pressed={done}
                  onClick={() =>
                    void run(async () => {
                      await toggleHabit(selected, d);
                      notify(done ? '已取消打卡' : '补录成功');
                    })
                  }
                >
                  {i + 1}
                  {done && <Check size={10} />}
                </button>
              );
            })}
          </div>
          <p className="notice">
            点击日期可补录或取消。当前连续完成{' '}
            {habitStreak(selectedHabit, data.checkIns, today)}{' '}
            {selectedHabit.frequency === 'weekly' ? '周' : '天'}。
          </p>
        </section>
      )}
    </Dialog>
  );
}
