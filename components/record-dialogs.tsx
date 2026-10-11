'use client';
import { useState } from 'react';
import { Star, Sparkles, Camera, Plus, Trash2 } from 'lucide-react';
import { db, metadata, saveRecord } from '@/lib/db';
import {
  scaleNutrition,
  parseLocalMeal,
  mealLabels,
  type FoodDraft,
} from '@/lib/nutrition';
import type {
  Tables,
  MealEntry,
  FoodItem,
  Habit,
  BodyMeasurement,
} from '@/lib/schemas';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Submit, useAction, type Notify } from './shared';
import { preparePhoto } from '@/lib/photos';
import { requestAI } from '@/lib/ai/client';
import { mealResultSchema, labelResultSchema } from '@/lib/ai/contracts';
import { localDate } from '@/lib/dates';
type Props = {
  data: Tables;
  date: string;
  notify: Notify;
  onClose: () => void;
};
export function MealDialog({
  data,
  date,
  notify,
  onClose,
  entry,
  aiReady,
  code,
}: { entry?: MealEntry; aiReady: boolean; code: string } & Props) {
  const [foodId, setFoodId] = useState(
    entry?.foodId || data.foods[0]?.id || '',
  );
  const [amount, setAmount] = useState(entry?.amount || 100);
  const [meal, setMeal] = useState<MealEntry['meal']>(
    entry?.meal || 'breakfast',
  );
  const [recordDate, setRecordDate] = useState(entry?.date || date);
  const [mode, setMode] = useState<'manual' | 'text'>('manual');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<FoodDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const { busy, run } = useAction(notify);
  const food = data.foods.find((f) => f.id === foodId);
  const nutrition =
    food && amount > 0 ? scaleNutrition(food.nutrition, amount) : null;
  const makeMeal = (item: FoodItem, qty: number, old?: MealEntry) => ({
    ...(old || metadata()),
    date: recordDate,
    meal,
    foodId: item.id,
    foodName: item.name,
    amount: qty,
    unit: item.unit,
    nutrition: scaleNutrition(item.nutrition, qty),
    source: item.source,
  });
  async function parse(useAI: boolean) {
    await run(async () => {
      if (!text.trim()) throw new Error('先写下你吃了什么');
      if (useAI) {
        const output = mealResultSchema.parse(
          await requestAI(
            {
              task: 'meal',
              text,
              foods: data.foods.map(
                ({ id, name, unit, serving, servingName }) => ({
                  id,
                  name,
                  unit,
                  serving,
                  servingName,
                }),
              ),
            },
            code,
          ),
        );
        const matched = output.items.filter((i) =>
          data.foods.some((f) => f.id === i.foodId && f.unit === i.unit),
        );
        setDraft(
          matched.map((item) => ({
            ...item,
            name: data.foods.find((food) => food.id === item.foodId)!.name,
          })),
        );
        setWarnings([
          ...output.warnings,
          ...(matched.length < output.items.length
            ? ['部分食物未匹配到食物库，请手动添加']
            : []),
        ]);
      } else {
        const output = parseLocalMeal(text, data.foods);
        setDraft(output.items);
        setWarnings(output.warnings);
      }
    });
  }
  return (
    <Dialog
      title={entry ? '编辑饮食记录' : '记下一餐'}
      description="每一餐，都是好好照顾自己的开始。营养数据用于日常参考。"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (recordDate > localDate(undefined, data.settings[0].timezone))
              throw new Error('不能记录未来饮食');
            if (mode === 'text') {
              if (!draft.length) throw new Error('请先解析并确认份量');
              await db.transaction(
                'rw',
                db.records.meals,
                db.outbox,
                async () => {
                  for (const item of draft) {
                    const f = data.foods.find((f) => f.id === item.foodId);
                    if (!f) throw new Error('食物不存在');
                    await saveRecord('meals', makeMeal(f, item.amount));
                  }
                },
              );
            } else {
              if (!food) throw new Error('请选择食物');
              await saveRecord('meals', makeMeal(food, amount, entry));
            }
            notify('这一餐已保存');
            onClose();
          });
        }}
      >
        {!entry && (
          <div className="segmented">
            <button
              type="button"
              className={mode === 'manual' ? 'active' : ''}
              onClick={() => setMode('manual')}
            >
              手动记录
            </button>
            <button
              type="button"
              className={mode === 'text' ? 'active' : ''}
              onClick={() => setMode('text')}
            >
              <Sparkles size={15} />
              一句话记录
            </button>
          </div>
        )}
        <div className="form-grid">
          <Field label="日期">
            <input
              aria-label="饮食日期"
              type="date"
              required
              max={localDate(undefined, data.settings[0].timezone)}
              value={recordDate}
              onChange={(e) => setRecordDate(e.target.value)}
            />
          </Field>
          <Field label="餐次">
            <select
              aria-label="餐次"
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealEntry['meal'])}
            >
              {Object.entries(mealLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {mode === 'manual' ? (
          <>
            <Field label="选择食物">
              <select
                aria-label="选择食物"
                value={foodId}
                onChange={(e) => setFoodId(e.target.value)}
              >
                {[...data.foods]
                  .sort((a, b) => Number(b.favorite) - Number(a.favorite))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.favorite ? '★ ' : ''}
                      {f.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={`实际食用量（${food?.unit || 'g'}）`}>
              <input
                aria-label="实际食用量"
                type="number"
                required
                min="0.1"
                max="10000"
                step="0.1"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </Field>
            {food && (
              <div className="row between">
                <p className="muted small">
                  1{food.servingName}约 {food.serving}
                  {food.unit}
                </p>
                <Button variant="ghost" onClick={() => setAmount(food.serving)}>
                  按一份填写
                </Button>
              </div>
            )}
            {nutrition && (
              <div className="nutrition-preview">
                <b>
                  {Math.round(nutrition.calories)}
                  <small> kcal</small>
                </b>
                <span>蛋白质 {nutrition.protein}g</span>
                <span>碳水 {nutrition.carbs}g</span>
                <span>脂肪 {nutrition.fat}g</span>
              </div>
            )}
            <p className="notice">{food?.source}</p>
          </>
        ) : (
          <>
            <Field label="描述这一餐">
              <textarea
                aria-label="饮食描述"
                placeholder="今天早餐吃了2个鸡蛋、2片吐司、250ml牛奶"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setDraft([]);
                }}
                maxLength={1000}
              />
            </Field>
            <div className="row wrap">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void parse(false)}
              >
                本地规则解析
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !aiReady}
                onClick={() => void parse(true)}
              >
                <Sparkles size={16} />
                AI解析
              </Button>
            </div>
            <p className="notice">
              本地规则仅识别已知食物和明确数量。点击AI解析会向OpenAI发送这段描述和食物匹配字段；确认后才写入记录。
            </p>
            {draft.map((item, index) => (
              <div className="draft-row" key={index}>
                <span>
                  {item.name}
                  <small>{item.note}</small>
                </span>
                <input
                  aria-label={`${item.name}份量`}
                  type="number"
                  min="1"
                  max="10000"
                  required
                  value={item.amount}
                  onChange={(e) =>
                    setDraft(
                      draft.map((d, i) =>
                        i === index
                          ? { ...d, amount: Number(e.target.value) }
                          : d,
                      ),
                    )
                  }
                />
                <span>{item.unit}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`移除${item.name}`}
                  onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {warnings.map((warning, i) => (
              <p className="notice" key={i}>
                {warning}
              </p>
            ))}
          </>
        )}
        <Submit busy={busy}>
          {mode === 'text' ? `确认并保存 ${draft.length} 项` : '保存这一餐'}
        </Submit>
      </form>
    </Dialog>
  );
}
export function FoodDialog({
  data,
  notify,
  onClose,
  food,
  aiReady,
  code,
}: { food?: FoodItem; aiReady: boolean; code: string } & Omit<Props, 'date'>) {
  const [name, setName] = useState(food?.name || '');
  const [unit, setUnit] = useState<'g' | 'ml'>(food?.unit || 'g');
  const [serving, setServing] = useState(food?.serving || 100);
  const [servingName, setServingName] = useState(food?.servingName || '份');
  const [source, setSource] = useState(
    food?.source || '用户录入：食品包装标签',
  );
  const [nutrition, setNutrition] = useState(
    food?.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const [favorite, setFavorite] = useState(food?.favorite || false);
  const [image, setImage] = useState<string>();
  const { busy, run } = useAction(notify);
  return (
    <Dialog
      title={food ? '编辑食物' : '添加我的食物'}
      description="按照包装每100g / 100ml录入。AI读图结果必须与你看到的标签核对。"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await saveRecord('foods', {
              ...(food || metadata()),
              name,
              unit,
              serving,
              servingName,
              nutrition,
              source,
              favorite,
            });
            notify('食物库已更新');
            onClose();
          });
        }}
      >
        <div className="label-upload">
          <Field label="可选：识别营养标签">
            <input
              type="file"
              aria-label="营养标签照片"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => setImage(await preparePhoto(file)));
              }}
            />
          </Field>
          {image && (
            <p className="notice">
              照片已在本机准备。点击识别即授权将本张标签照片发送至OpenAI。
            </p>
          )}
          <Button
            variant="secondary"
            disabled={!image || !aiReady || busy}
            onClick={() =>
              void run(async () => {
                const result = labelResultSchema.parse(
                  await requestAI(
                    { task: 'label', text: '识别包装营养表', image },
                    code,
                  ),
                );
                setName(result.name);
                setUnit(result.unit);
                setNutrition(result.nutrition);
                setSource(
                  `AI识别，待用户核对：${result.notes.join('；')}`.slice(
                    0,
                    200,
                  ),
                );
                notify('已填入识别草稿，请核对每一项');
              })
            }
          >
            <Camera size={16} />
            识别标签并填写草稿
          </Button>
        </div>
        <Field label="食物名称">
          <input
            required
            maxLength={60}
            aria-label="食物名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="营养基准">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'g' | 'ml')}
            >
              <option value="g">每100g</option>
              <option value="ml">每100ml</option>
            </select>
          </Field>
          <Field label="每份重量 / 容量">
            <input
              type="number"
              min="1"
              max="2000"
              required
              value={serving}
              onChange={(e) => setServing(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="份量单位名称">
          <input
            required
            value={servingName}
            maxLength={20}
            onChange={(e) => setServingName(e.target.value)}
            placeholder="份 / 个 / 片"
          />
        </Field>
        <div className="form-grid">
          {(
            [
              { key: 'calories', label: '能量 kcal' },
              { key: 'protein', label: '蛋白质 g' },
              { key: 'carbs', label: '碳水 g' },
              { key: 'fat', label: '脂肪 g' },
            ] as const
          ).map(({ key, label }) => (
            <Field label={label} key={key}>
              <input
                aria-label={label}
                type="number"
                step="0.1"
                min="0"
                max={key === 'calories' ? 10000 : 1000}
                required
                value={nutrition[key]}
                onChange={(e) =>
                  setNutrition({ ...nutrition, [key]: Number(e.target.value) })
                }
              />
            </Field>
          ))}
        </div>
        <Field label="数据来源与备注">
          <input
            required
            maxLength={200}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </Field>
        <label className="check-field">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
          />
          <Star size={16} />
          收藏为常吃食物
        </label>
        <p className="notice">
          当前食物库有 {data.foods.length}{' '}
          项。保存后不会改变以前记录的营养快照。
        </p>
        <Submit busy={busy}>我已核对，保存食物</Submit>
      </form>
    </Dialog>
  );
}
export function HabitDialog({
  notify,
  onClose,
  habit,
}: {
  habit?: Habit;
  notify: Notify;
  onClose: () => void;
}) {
  const [name, setName] = useState(habit?.name || '');
  const [icon, setIcon] = useState<Habit['icon']>(habit?.icon || 'spark');
  const [frequency, setFrequency] = useState<Habit['frequency']>(
    habit?.frequency || 'daily',
  );
  const [goal, setGoal] = useState(habit?.weeklyGoal || 3);
  const { busy, run } = useAction(notify);
  return (
    <Dialog
      title={habit ? '编辑习惯' : '一个小小的好习惯'}
      description="可以慢慢来。中断也没关系，任何一天都能重新开始。"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await saveRecord('habits', {
              ...(habit || metadata()),
              name,
              icon,
              frequency,
              weeklyGoal: frequency === 'daily' ? 7 : goal,
              paused: habit?.paused || false,
            });
            notify('习惯已保存');
            onClose();
          });
        }}
      >
        <Field label="习惯名称">
          <input
            aria-label="习惯名称"
            required
            maxLength={30}
            placeholder="比如：散步 20 分钟"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="图标">
            <select
              value={icon}
              onChange={(e) => setIcon(e.target.value as Habit['icon'])}
            >
              <option value="water">饮水</option>
              <option value="book">阅读 / 学习</option>
              <option value="moon">睡眠</option>
              <option value="walk">活动</option>
              <option value="spark">其他</option>
            </select>
          </Field>
          <Field label="频率">
            <select
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as Habit['frequency'])
              }
            >
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
            </select>
          </Field>
        </div>
        {frequency === 'weekly' && (
          <Field label="每周目标天数">
            <input
              required
              type="number"
              min="1"
              max="7"
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
            />
          </Field>
        )}
        <Submit busy={busy} />
      </form>
    </Dialog>
  );
}
export function BodyDialog({
  data,
  date,
  notify,
  onClose,
  measurement,
}: { measurement?: BodyMeasurement } & Props) {
  const existing =
    measurement || data.measurements.find((m) => m.date === date);
  const [recordDate, setRecordDate] = useState(existing?.date || date);
  const [weight, setWeight] = useState(
    existing?.weight || data.profiles[0].weight,
  );
  const [waist, setWaist] = useState(existing?.waist?.toString() || '');
  const [photo, setPhoto] = useState(existing?.photo || null);
  const { busy, run } = useAction(notify);
  return (
    <Dialog
      title="记录身体状态"
      description="关注多周的变化，不必被一天的数字影响心情。"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (recordDate > localDate(undefined, data.settings[0].timezone))
              throw new Error('不能记录未来测量');
            const old = data.measurements.find((m) => m.date === recordDate);
            if (existing && old && old.id !== existing.id)
              throw new Error('这个日期已有测量记录，请直接编辑该日期的记录');
            await saveRecord('measurements', {
              ...(old || existing || metadata()),
              date: recordDate,
              weight,
              waist: waist ? Number(waist) : null,
              photo,
            });
            notify('身体记录已保存');
            onClose();
          });
        }}
      >
        <Field label="测量日期">
          <input
            aria-label="测量日期"
            type="date"
            required
            max={localDate(undefined, data.settings[0].timezone)}
            value={recordDate}
            onChange={(e) => setRecordDate(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="体重 kg">
            <input
              aria-label="体重 kg"
              type="number"
              min="30"
              max="300"
              step="0.1"
              required
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
            />
          </Field>
          <Field label="腰围 cm（可选）">
            <input
              aria-label="腰围 cm"
              type="number"
              min="30"
              max="250"
              step="0.1"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
            />
          </Field>
        </div>
        <Field label="体型照片（可选，仅本机）">
          <input
            aria-label="体型照片"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void run(async () => setPhoto(await preparePhoto(file)));
            }}
          />
        </Field>
        {photo && (
          <>
            <p className="notice">
              已保存照片，默认不发送给AI。照片会包含在JSON备份中。
            </p>
            <Button variant="ghost" onClick={() => setPhoto(null)}>
              移除照片
            </Button>
          </>
        )}
        <Submit busy={busy} />
      </form>
    </Dialog>
  );
}
export function AddFoodButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      <Plus size={16} />
      自定义食物
    </Button>
  );
}
