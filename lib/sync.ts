import type { TableName, Row } from './schemas';
// 云端阶段的边界：本地事务 + outbox 已就绪；当前没有虚构同步成功。
export interface SyncAdapter {
  status(): Promise<'offline' | 'syncing' | 'synced' | 'error'>;
  push<K extends TableName>(table: K, rows: Row<K>[]): Promise<void>;
  pull<K extends TableName>(table: K, since: string): Promise<Row<K>[]>;
}
export const cloudSyncAvailable = false;
