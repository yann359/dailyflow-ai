import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import {
  DailyFlowDB,
  initializeDB,
  metadata,
  saveRecord,
  removeRecord,
  loadData,
  exportBackup,
  importBackup,
  toggleHabit,
  clearLocalData,
} from '@/lib/db';
import { scaleNutrition } from '@/lib/nutrition';
import { localWeeklyReport } from '@/lib/insights';
let database: DailyFlowDB;
beforeEach(async () => {
  database = new DailyFlowDB(`test-${crypto.randomUUID()}`);
  await initializeDB(database);
});
afterEach(async () => {
  await database.delete();
});
describe('本地数据可靠性', () => {
  it('初始化幂等，真实记录为空', async () => {
    await initializeDB(database);
    const data = await loadData(database);
    expect(data.profiles).toHaveLength(1);
    expect(data.foods).toHaveLength(8);
    expect(data.meals).toEqual([]);
    expect(data.measurements).toEqual([]);
    expect(data.sessions).toEqual([]);
  });
  it('饮食CRUD、营养快照和删除标记', async () => {
    const food = (await loadData(database)).foods[0];
    const meal = {
      ...metadata('m'),
      date: '2026-10-11',
      meal: 'breakfast' as const,
      foodId: food.id,
      foodName: food.name,
      amount: 100,
      unit: food.unit,
      nutrition: scaleNutrition(food.nutrition, 100),
      source: food.source,
    };
    await saveRecord('meals', meal, database);
    await saveRecord(
      'foods',
      { ...food, nutrition: { ...food.nutrition, protein: 999 } },
      database,
    );
    expect((await loadData(database)).meals[0].nutrition.protein).toBe(
      food.nutrition.protein,
    );
    await saveRecord(
      'meals',
      { ...meal, amount: 50, nutrition: scaleNutrition(food.nutrition, 50) },
      database,
    );
    expect((await loadData(database)).meals[0].amount).toBe(50);
    await removeRecord('meals', 'm', database);
    expect((await loadData(database)).meals).toEqual([]);
    expect((await database.records.meals.get('m'))?.deletedAt).toBeTruthy();
    expect(await database.outbox.count()).toBe(2);
  });
  it('关闭并重新打开IndexedDB，数据保留', async () => {
    await saveRecord(
      'measurements',
      {
        ...metadata('b'),
        date: '2026-10-11',
        weight: 74.3,
        waist: 80,
        photo: null,
      },
      database,
    );
    const name = database.name;
    database.close();
    database = new DailyFlowDB(name);
    expect((await loadData(database)).measurements[0].weight).toBe(74.3);
  });
  it('打卡去重、取消和恢复', async () => {
    await toggleHabit('habit-water', '2026-10-11', database);
    expect((await loadData(database)).checkIns).toHaveLength(1);
    await toggleHabit('habit-water', '2026-10-11', database);
    expect((await loadData(database)).checkIns).toHaveLength(0);
    await toggleHabit('habit-water', '2026-10-11', database);
    expect(await database.records.checkIns.count()).toBe(1);
  });
  it('验证失败不写入', async () => {
    await expect(
      saveRecord(
        'measurements',
        {
          ...metadata('bad'),
          date: '2026-02-30',
          weight: -1,
          waist: null,
          photo: null,
        },
        database,
      ),
    ).rejects.toThrow();
    expect(await database.records.measurements.count()).toBe(0);
  });
  it('备份往返并保留旧记录', async () => {
    await saveRecord(
      'measurements',
      {
        ...metadata('b'),
        date: '2026-10-11',
        weight: 75,
        waist: null,
        photo: null,
      },
      database,
    );
    const backup = await exportBackup(database);
    await saveRecord(
      'measurements',
      {
        ...metadata('new'),
        date: '2026-10-10',
        weight: 76,
        waist: null,
        photo: null,
      },
      database,
    );
    await importBackup(backup, database);
    expect((await loadData(database)).measurements).toHaveLength(2);
  });
  it('旧备份不覆盖较新本地值', async () => {
    const backup = await exportBackup(database);
    backup.tables.profiles[0].updatedAt = '2020-01-01T00:00:00.000Z';
    backup.tables.profiles[0].name = '旧名称';
    await importBackup(backup, database);
    expect((await loadData(database)).profiles[0].name).toBe('轻律同学');
  });
  it('拒绝未知版本、关联损坏、重复主键备份且保持原数据', async () => {
    const backup = await exportBackup(database);
    await expect(
      importBackup({ ...backup, version: 99 }, database),
    ).rejects.toThrow();
    await expect(
      importBackup(
        {
          ...backup,
          tables: {
            ...backup.tables,
            checkIns: [
              { ...metadata('bad'), habitId: 'missing', date: '2026-10-11' },
            ],
          },
        },
        database,
      ),
    ).rejects.toThrow();
    backup.tables.foods.push(backup.tables.foods[0]);
    await expect(importBackup(backup, database)).rejects.toThrow('重复主键');
    expect((await loadData(database)).foods).toHaveLength(8);
  });
  it('软删除后仍能导出关联完整的备份', async () => {
    await toggleHabit('habit-water', '2026-10-11', database);
    await removeRecord('habits', 'habit-water', database);
    expect((await exportBackup(database)).tables.habits).toHaveLength(3);
  });
  it('重置后恢复初始设置并清空数据', async () => {
    await toggleHabit('habit-water', '2026-10-11', database);
    await clearLocalData(database);
    const data = await loadData(database);
    expect(data.checkIns).toEqual([]);
    expect(data.habits).toHaveLength(3);
    expect(await database.outbox.count()).toBe(0);
  });
  it('数据不足时周报明确缺失，不编造进步', async () => {
    const report = localWeeklyReport(await loadData(database), '2026-10-11');
    expect(report).toContain('记录了 0 天');
    expect(report).toContain('尚无身体测量');
    expect(report).toContain('没有调用AI模型');
  });
});
