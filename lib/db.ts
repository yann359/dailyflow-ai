import Dexie, { type Table } from 'dexie';
import {
  backupSchema,
  tableSchemas,
  type TableName,
  type Tables,
  type Row,
  type Backup,
} from './schemas';
import { localDate, weekStart } from './dates';
export type OutboxItem = {
  id: string;
  table: TableName;
  recordId: string;
  updatedAt: string;
  attempts: number;
};
export class DailyFlowDB extends Dexie {
  records!: { [K in TableName]: Table<Row<K>, string> };
  outbox!: Table<OutboxItem, string>;
  constructor(name = 'DailyFlowAI') {
    super(name);
    const indexes = {
      profiles: 'id',
      foods: 'id,name,favorite',
      meals: 'id,date,meal,foodId',
      targets: 'id',
      habits: 'id',
      checkIns: 'id,[habitId+date],date,habitId',
      measurements: 'id,date',
      plans: 'id',
      sessions: 'id,date,planId',
      sets: 'id,sessionId,exerciseId',
      conversations: 'id,createdAt',
      settings: 'id',
    };
    this.version(1).stores(indexes);
    this.version(2).stores({
      ...indexes,
      outbox: 'id,table,recordId,updatedAt',
    });
    this.records = Object.fromEntries(
      Object.keys(tableSchemas).map((name) => [name, this.table(name)]),
    ) as DailyFlowDB['records'];
    this.outbox = this.table('outbox');
  }
}
export const db = new DailyFlowDB();
export function metadata(id = crypto.randomUUID() as string) {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ownerId: 'local',
  };
}
export async function saveRecord<K extends TableName>(
  table: K,
  input: Row<K>,
  database = db,
) {
  const parsed = tableSchemas[table].parse({
    ...input,
    updatedAt: new Date().toISOString(),
  }) as Row<K>;
  await database.transaction(
    'rw',
    database.records[table],
    database.outbox,
    async () => {
      await database.records[table].put(parsed);
      await database.outbox.put({
        id: `${table}:${parsed.id}`,
        table,
        recordId: parsed.id,
        updatedAt: parsed.updatedAt,
        attempts: 0,
      });
    },
  );
  return parsed;
}
export async function removeRecord(
  table: TableName,
  id: string,
  database = db,
) {
  const item = await database.records[table].get(id);
  if (!item) throw new Error('记录不存在');
  await saveRecord(
    table,
    { ...item, deletedAt: new Date().toISOString() },
    database,
  );
}
export async function toggleHabit(
  habitId: string,
  date: string,
  database = db,
) {
  const id = `${habitId}:${date}`;
  await database.transaction(
    'rw',
    database.records.checkIns,
    database.outbox,
    async () => {
      const old = await database.records.checkIns.get(id);
      await saveRecord(
        'checkIns',
        {
          ...(old ?? metadata(id)),
          habitId,
          date,
          deletedAt: old && !old.deletedAt ? new Date().toISOString() : null,
        },
        database,
      );
    },
  );
}
export const seedFoods = [
  {
    name: '鸡蛋',
    unit: 'g',
    serving: 50,
    servingName: '个',
    nutrition: { calories: 144, protein: 13.3, carbs: 2.8, fat: 8.8 },
  },
  {
    name: '纯牛奶',
    unit: 'ml',
    serving: 250,
    servingName: '杯',
    nutrition: { calories: 64, protein: 3.2, carbs: 4.8, fat: 3.6 },
  },
  {
    name: '熟米饭',
    unit: 'g',
    serving: 150,
    servingName: '碗',
    nutrition: { calories: 116, protein: 2.6, carbs: 25.9, fat: 0.3 },
  },
  {
    name: '鸡胸肉',
    unit: 'g',
    serving: 100,
    servingName: '份',
    nutrition: { calories: 133, protein: 19.4, carbs: 2.5, fat: 5 },
  },
  {
    name: '苹果',
    unit: 'g',
    serving: 200,
    servingName: '个',
    nutrition: { calories: 53, protein: 0.4, carbs: 13.5, fat: 0.2 },
  },
  {
    name: '全麦吐司',
    unit: 'g',
    serving: 30,
    servingName: '片',
    nutrition: { calories: 246, protein: 9, carbs: 43, fat: 4 },
  },
  {
    name: '燕麦片',
    unit: 'g',
    serving: 40,
    servingName: '份',
    nutrition: { calories: 377, protein: 15, carbs: 61.6, fat: 6.7 },
  },
  {
    name: '西兰花',
    unit: 'g',
    serving: 100,
    servingName: '份',
    nutrition: { calories: 36, protein: 4.1, carbs: 4.3, fat: 0.6 },
  },
] as const;
export async function initializeDB(database = db) {
  await database.transaction(
    'rw',
    Object.values(database.records),
    async () => {
      if (await database.records.profiles.count()) return;
      await database.records.profiles.put({
        ...metadata('profile'),
        name: '轻律同学',
        sex: 'male',
        age: 21,
        height: 177,
        weight: 75,
        goal: '规律三餐，练出自然的线条',
        activity: 'moderate',
      });
      await database.records.targets.put({
        ...metadata('target'),
        calories: 2200,
        protein: 120,
        carbs: 270,
        fat: 65,
      });
      await database.records.plans.put({
        ...metadata('plan'),
        startDate: weekStart(localDate()),
        days: [1, 3, 5],
        paused: false,
      });
      await database.records.settings.put({
        ...metadata('settings'),
        theme: 'system',
        aiEnabled: false,
        notifications: false,
        hiddenModules: [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await database.records.foods.bulkPut(
        seedFoods.map((food, index) => ({
          ...metadata(`food-${index}`),
          ...food,
          nutrition: { ...food.nutrition },
          source: '内置参考值（不同品牌、烹饪方法有差异，请以包装标签为准）',
          favorite: index < 2,
        })),
      );
      await database.records.habits.bulkPut([
        {
          ...metadata('habit-water'),
          name: '好好喝水',
          icon: 'water',
          frequency: 'daily',
          weeklyGoal: 7,
          paused: false,
        },
        {
          ...metadata('habit-read'),
          name: '阅读 20 分钟',
          icon: 'book',
          frequency: 'daily',
          weeklyGoal: 7,
          paused: false,
        },
        {
          ...metadata('habit-sleep'),
          name: '睡前放下手机',
          icon: 'moon',
          frequency: 'daily',
          weeklyGoal: 7,
          paused: false,
        },
      ]);
    },
  );
}
export async function loadData(database = db): Promise<Tables> {
  const pairs = await Promise.all(
    (Object.keys(tableSchemas) as TableName[]).map(async (name) => [
      name,
      (await database.records[name].toArray()).filter((row) => !row.deletedAt),
    ]),
  );
  return Object.fromEntries(pairs) as Tables;
}
export async function exportBackup(database = db) {
  const tables = await database.transaction(
    'r',
    Object.values(database.records),
    async () =>
      Object.fromEntries(
        await Promise.all(
          (Object.keys(tableSchemas) as TableName[]).map(async (name) => [
            name,
            await database.records[name].toArray(),
          ]),
        ),
      ),
  );
  return backupSchema.parse({
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  });
}
export function validateBackup(input: unknown): Backup {
  const parsed = backupSchema.parse(input);
  for (const rows of Object.values(parsed.tables))
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new Error('备份存在重复主键');
  for (const key of ['profiles', 'targets', 'plans', 'settings'] as const)
    if (parsed.tables[key].length !== 1)
      throw new Error('备份缺少唯一的基础设置');
  const singletonIds = {
    profiles: 'profile',
    targets: 'target',
    plans: 'plan',
    settings: 'settings',
  } as const;
  for (const key of Object.keys(
    singletonIds,
  ) as (keyof typeof singletonIds)[]) {
    if (
      parsed.tables[key][0].id !== singletonIds[key] ||
      parsed.tables[key][0].deletedAt
    )
      throw new Error('备份基础设置标识无效');
  }
  const habitIds = new Set(parsed.tables.habits.map((h) => h.id));
  const sessionIds = new Set(parsed.tables.sessions.map((s) => s.id));
  const planIds = new Set(parsed.tables.plans.map((p) => p.id));
  const foodIds = new Set(parsed.tables.foods.map((f) => f.id));
  if (
    parsed.tables.checkIns.some((c) => !habitIds.has(c.habitId)) ||
    parsed.tables.sets.some((s) => !sessionIds.has(s.sessionId)) ||
    parsed.tables.sessions.some((s) => !planIds.has(s.planId)) ||
    parsed.tables.meals.some((m) => !foodIds.has(m.foodId))
  )
    throw new Error('备份中的记录关联不完整');
  return parsed;
}
export async function importBackup(input: unknown, database = db) {
  const backup = validateBackup(input);
  const names = Object.keys(tableSchemas) as TableName[];
  await database.transaction(
    'rw',
    [...Object.values(database.records), database.outbox],
    async () => {
      for (const name of names)
        for (const row of backup.tables[name]) {
          const old = await database.records[name].get(row.id);
          if (!old || old.updatedAt < row.updatedAt) {
            await database.table<Row<TableName>, string>(name).put(row);
            await database.outbox.put({
              id: `${name}:${row.id}`,
              table: name,
              recordId: row.id,
              updatedAt: row.updatedAt,
              attempts: 0,
            });
          }
        }
    },
  );
}
export async function clearLocalData(database = db) {
  await database.transaction(
    'rw',
    [...Object.values(database.records), database.outbox],
    async () => {
      for (const table of Object.values(database.records)) await table.clear();
      await database.outbox.clear();
    },
  );
  await initializeDB(database);
}
