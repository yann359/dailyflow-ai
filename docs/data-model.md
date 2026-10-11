# 数据模型与可靠性

所有实体都有`id`、`createdAt`、`updatedAt`、`deletedAt`、`ownerId`。UUID或可确定主键用于去重，默认owner为`local`。本机数据库`DailyFlowAI`当前Dexie版本2，JSON备份格式版本1；两者各自有版本边界。未来版本需新增Dexie升级事务和备份迁移器，未知备份版本当前拒绝导入。

| 实体            | 表            | 主要内容                                         |
| --------------- | ------------- | ------------------------------------------------ |
| Profile         | profiles      | 可修改姓名、年龄、身高、初始体重、目标、活动程度 |
| FoodItem        | foods         | 每100g/ml营养、默认份量、来源、收藏              |
| MealEntry       | meals         | 本地日期、餐次、食物引用、重量、营养快照         |
| NutritionTarget | targets       | 个性化热量与三大营养目标                         |
| WorkoutPlan     | plans         | 开始日期、3个不同训练日、暂停状态                |
| WorkoutSession  | sessions      | 日期、A/B、周期周数、草稿/完成状态               |
| ExerciseSet     | sets          | 动作、组序号、实际次数或秒、负重、完成状态       |
| Habit           | habits        | 名称、图标、每日/每周、每周目标、暂停            |
| HabitCheckIn    | checkIns      | 习惯ID与日期；确定主键保证同日唯一               |
| BodyMeasurement | measurements  | 日期、体重、可选腰围和压缩照片                   |
| AIConversation  | conversations | 用户问题、回复、来源(local/openai)、类型         |
| Settings        | settings      | 主题、时区、AI开关、隐藏模块等                   |
| 同步待办        | outbox        | 记录所属表、ID、更新时间、重试次数               |

基础单例ID固定为`profile`、`target`、`plan`、`settings`，防止备份合并产生两份相互冲突的设置。删除使用墓碑，查询过滤`deletedAt`，备份保留墓碑和关联记录。删除食物不删除历史营养快照。

每次写入经Zod校验。记录与outbox在同一事务提交；训练会话和所有组、习惯及打卡批量删除也采用事务。导入先验证所有表、唯一主键和关联，再在单个事务中合并：同ID保留更新时间较新的记录，不删除其他本地记录；原时间戳保留，重复导入不会重复插入。

开始日期后的84天内安排36次训练，按时间顺序A/B交替。每7天为一个计划周，前两周2组、后续3组。界面的本周统计按周一到周日计算，与计划周概念不同。

## Supabase阶段方案（尚未启用）

`lib/sync.ts`定义适配器边界，当前没有同步执行器。后续云表用`owner_id uuid references auth.users`，所有表启用RLS并分别约束select/insert/update/delete为`auth.uid() = owner_id`；插入/更新同时使用WITH CHECK。照片桶设为私有，路径首段为用户ID，Storage策略限制访问当前用户目录。

同步先推outbox再拉远端游标，服务端更新时间作为冲突排序依据，删除标记传递到远端。失败保持本地值和待办，指数退避；冲突记录保留双方版本由用户选择，不能用远端空响应清空本地。测试需覆盖两设备同ID并发编辑、删除后重连、重复重试、错误账号切换、RLS越权与离线创建。
