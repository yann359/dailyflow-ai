'use client';
import { useState } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  Monitor,
  Leaf,
  Trash2,
  HardDrive,
} from 'lucide-react';
import type { Tables, Profile, Settings } from '@/lib/schemas';
import {
  saveRecord,
  exportBackup,
  importBackup,
  validateBackup,
  clearLocalData,
} from '@/lib/db';
import { Button } from './ui/button';
import { Field, Submit, useAction, type Notify } from './shared';
import { Dialog } from './ui/dialog';
import { AIModelCenter } from './ai-model-center';
import type { CenterStatus } from '@/lib/ai/catalog';
export type AIStatus = CenterStatus;
export function SettingsTab({
  data,
  notify,
  onInstall,
}: {
  data: Tables;
  notify: Notify;
  onInstall: () => void;
}) {
  const profile = data.profiles[0];
  const target = data.targets[0];
  const settings = data.settings[0];
  const plan = data.plans[0];
  const { busy, run } = useAction(notify);
  const [clear, setClear] = useState(false);
  const [clearText, setClearText] = useState('');
  function updateSettings(update: Partial<Settings>) {
    void run(async () => {
      await saveRecord('settings', { ...settings, ...update });
      notify('偏好已保存');
    });
  }
  return (
    <>
      <section className="card profile-banner">
        <div className="avatar">
          <Leaf size={30} />
        </div>
        <div>
          <span className="eyebrow">A LITTLE BETTER, EVERY DAY</span>
          <h2>{profile.name}</h2>
          <p>{profile.goal}</p>
        </div>
        <span className="pill">
          <HardDrive size={13} />
          本地模式
        </span>
      </section>
      <div className="two-col">
        <section className="card settings-card">
          <h3>我的档案</h3>
          <p className="muted small">
            初始值是可修改示例，不代表已测量的身体数据。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await saveRecord('profiles', {
                  ...profile,
                  name: String(f.get('name')),
                  sex: String(f.get('sex')) as Profile['sex'],
                  age: Number(f.get('age')),
                  height: Number(f.get('height')),
                  weight: Number(f.get('weight')),
                  goal: String(f.get('goal')),
                  activity: String(f.get('activity')) as Profile['activity'],
                });
                notify('档案已更新');
              });
            }}
          >
            <Field label="称呼">
              <input
                aria-label="称呼"
                name="name"
                defaultValue={profile.name}
                required
                maxLength={30}
              />
            </Field>
            <div className="form-grid">
              <Field label="性别">
                <select name="sex" defaultValue={profile.sex}>
                  <option value="male">男</option>
                  <option value="female">女</option>
                  <option value="other">其他 / 不透露</option>
                </select>
              </Field>
              <Field label="年龄">
                <input
                  name="age"
                  type="number"
                  min="18"
                  max="100"
                  required
                  defaultValue={profile.age}
                />
              </Field>
              <Field label="身高 cm">
                <input
                  name="height"
                  type="number"
                  min="100"
                  max="250"
                  required
                  defaultValue={profile.height}
                />
              </Field>
              <Field label="初始体重 kg">
                <input
                  name="weight"
                  type="number"
                  min="30"
                  max="300"
                  step="0.1"
                  required
                  defaultValue={profile.weight}
                />
              </Field>
            </div>
            <Field label="我的方向">
              <input
                name="goal"
                required
                maxLength={150}
                defaultValue={profile.goal}
              />
            </Field>
            <Field label="日常活动">
              <select name="activity" defaultValue={profile.activity}>
                <option value="low">以坐着为主</option>
                <option value="moderate">日常有走动</option>
                <option value="high">较多体力活动</option>
              </select>
            </Field>
            <Submit busy={busy}>更新档案</Submit>
          </form>
        </section>
        <div className="stack">
          <section className="card settings-card">
            <h3>我的营养目标</h3>
            <p className="notice">
              目标用于日常记录参考，不会自动根据体重降低热量。避免激进节食。
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  await saveRecord('targets', {
                    ...target,
                    calories: Number(f.get('calories')),
                    protein: Number(f.get('protein')),
                    carbs: Number(f.get('carbs')),
                    fat: Number(f.get('fat')),
                  });
                  notify('营养目标已更新');
                });
              }}
            >
              <div className="form-grid">
                {(
                  [
                    {
                      key: 'calories',
                      label: '热量 kcal',
                      min: 1200,
                      max: 5000,
                    },
                    { key: 'protein', label: '蛋白质 g', min: 30, max: 300 },
                    { key: 'carbs', label: '碳水 g', min: 50, max: 700 },
                    { key: 'fat', label: '脂肪 g', min: 20, max: 200 },
                  ] as const
                ).map(({ key, label, min, max }) => (
                  <Field key={key} label={label}>
                    <input
                      name={key}
                      type="number"
                      min={min}
                      max={max}
                      required
                      defaultValue={target[key]}
                    />
                  </Field>
                ))}
              </div>
              <Submit busy={busy}>保存营养目标</Submit>
            </form>
          </section>
          <section className="card settings-card">
            <h3>安排自己的训练节奏</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const days = f.getAll('days').map(Number);
                  if (days.length !== 3) throw new Error('请选择每周3个训练日');
                  await saveRecord('plans', {
                    ...plan,
                    startDate: String(f.get('startDate')),
                    days,
                  });
                  notify('训练安排已更新，历史记录不变');
                });
              }}
            >
              <Field label="12周计划开始日期">
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={plan.startDate}
                />
              </Field>
              <div className="weekday-picker">
                {['日', '一', '二', '三', '四', '五', '六'].map((day, i) => (
                  <label key={i}>
                    <input
                      name="days"
                      type="checkbox"
                      value={i}
                      defaultChecked={plan.days.includes(i)}
                    />
                    <span>{day}</span>
                  </label>
                ))}
              </div>
              <p className="notice">
                推荐训练之间留出恢复时间。调整日期会重新排列未来A/B计划。
              </p>
              <Submit busy={busy}>保存训练日</Submit>
            </form>
          </section>
        </div>
      </div>
      <div className="two-col">
        <section className="card settings-card">
          <h3>
            <Monitor size={18} />
            让它更像你
          </h3>
          <Field label="外观">
            <select
              aria-label="主题"
              value={settings.theme}
              onChange={(e) =>
                updateSettings({ theme: e.target.value as Settings['theme'] })
              }
            >
              <option value="system">跟随系统</option>
              <option value="light">明亮</option>
              <option value="dark">深色</option>
            </select>
          </Field>
          <Field label="记录时区">
            <select
              aria-label="记录时区"
              value={settings.timezone}
              onChange={(e) => updateSettings({ timezone: e.target.value })}
            >
              {[
                ...new Set([
                  settings.timezone,
                  'Asia/Shanghai',
                  'Asia/Hong_Kong',
                  'Asia/Tokyo',
                  'Europe/London',
                  'America/New_York',
                  'America/Los_Angeles',
                  'UTC',
                ]),
              ].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          <h4>首页显示内容</h4>
          {(
            [
              { id: 'nutrition', name: '营养概况' },
              { id: 'workout', name: '训练安排' },
              { id: 'habits', name: '习惯清单' },
              { id: 'week', name: '本周节奏' },
            ] as const
          ).map((module) => (
            <label className="check-field" key={module.id}>
              <input
                type="checkbox"
                checked={!settings.hiddenModules.includes(module.id)}
                onChange={(e) =>
                  updateSettings({
                    hiddenModules: e.target.checked
                      ? settings.hiddenModules.filter((id) => id !== module.id)
                      : [...settings.hiddenModules, module.id],
                  })
                }
              />
              {module.name}
            </label>
          ))}
          <Button variant="secondary" onClick={onInstall}>
            添加到主屏幕
          </Button>
          <p className="notice">通知暂未实现推送；当前版本不会主动发送提醒。</p>
        </section>
      </div>
      <AIModelCenter data={data} notify={notify} />
      <section className="card settings-card">
        <h3>
          <ShieldCheck size={18} />
          数据属于你
        </h3>
        <p className="detail-copy">
          所有记录保存在当前浏览器的 IndexedDB
          中，尚未启用云同步。换手机、换浏览器或清除网站数据前，请先导出备份。备份包含身体照片，请妥善保管。
        </p>
        <div className="row wrap">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const backup = await exportBackup();
                const blob = new Blob([JSON.stringify(backup, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `dailyflow-backup-${backup.exportedAt.slice(0, 10)}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                notify('备份已导出，请妥善保存');
              })
            }
          >
            <Download size={16} />
            导出JSON备份
          </Button>
          <label
            className={`button button-secondary file-button ${busy ? 'disabled' : ''}`}
          >
            <Upload size={16} />
            导入备份
            <input
              disabled={busy}
              aria-label="导入备份"
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file)
                  void run(async () => {
                    if (file.size > 25 * 1024 * 1024)
                      throw new Error('备份不能超过25MB');
                    const input = validateBackup(JSON.parse(await file.text()));
                    const count = Object.values(input.tables).reduce(
                      (n, rows) => n + rows.length,
                      0,
                    );
                    if (
                      !window.confirm(
                        `已验证备份（${count}条数据）。合并到本机？同一主键保留更新时间较新的记录，其他记录保留。`,
                      )
                    )
                      return;
                    await importBackup(input);
                    notify('备份已合并，原有较新记录保留');
                  });
              }}
            />
          </label>
          <Button
            variant="ghost"
            onClick={() =>
              void run(async () => {
                const persisted = await navigator.storage?.persist?.();
                notify(
                  persisted
                    ? '浏览器已允许持久化存储'
                    : '浏览器尚未批准持久化，请定期导出备份',
                );
              })
            }
          >
            <HardDrive size={16} />
            申请持久存储
          </Button>
          <Button variant="danger" onClick={() => setClear(true)}>
            <Trash2 size={16} />
            清除本地数据
          </Button>
        </div>
      </section>
      <footer className="page-footer">
        DailyFlow AI · v0.1.0 <span>慢慢来，也是在向前。</span>
      </footer>
      {clear && (
        <Dialog
          title="清除本地所有记录？"
          description="这会删除饮食、训练、身体照片、习惯和AI记录，并重置初始设置。请先导出备份。"
          onClose={() => setClear(false)}
        >
          <Field label="输入「清除」确认">
            <input
              value={clearText}
              onChange={(e) => setClearText(e.target.value)}
              aria-label="清除确认"
            />
          </Field>
          <Button
            className="full"
            variant="danger"
            disabled={clearText !== '清除' || busy}
            onClick={() =>
              void run(async () => {
                await clearLocalData();
                setClear(false);
                setClearText('');
                notify('本地数据已重置');
              })
            }
          >
            确认清除
          </Button>
        </Dialog>
      )}
    </>
  );
}
