'use client';
import { useEffect, useState } from 'react';
import { Sparkles, ShieldCheck, RefreshCw, Plus, LogOut } from 'lucide-react';
import { aiFetch } from '@/lib/ai/client';
import {
  providers,
  providerIds,
  preferencesSchema,
  selectionLabel,
  type CenterStatus,
  type AIConfig,
  type Model,
  type Selection,
  type ProviderId,
} from '@/lib/ai/catalog';
import type { Tables } from '@/lib/schemas';
import type { UsageEntry } from '@/lib/ai/budget';
import { saveRecord } from '@/lib/db';
import { Button } from './ui/button';
import { Field, useAction, type Notify } from './shared';
type Summary = {
  calls: number;
  estimatedUSD: number;
  entries: UsageEntry[];
  providers: Record<string, number>;
  limits: { daily: number; monthly: number; usd: number };
};
const capabilityNames = {
  text: '文本',
  image: '图像',
  stream: '流式',
  structured: '结构化',
  tools: '工具调用',
};
const connectionNames = {
  success: '连接成功',
  auth: '验证失败',
  credit: '额度不足',
  model: '模型不可用',
  network: '网络异常',
  error: '调用失败',
};
export function AIModelCenter({
  data,
  notify,
}: {
  data: Tables;
  notify: Notify;
}) {
  const [status, setStatus] = useState<CenterStatus>();
  const [config, setConfig] = useState<AIConfig>();
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [preferences, setPreferences] = useState(() =>
    preferencesSchema.parse(data.settings[0].aiPreferences || {}),
  );
  const [edit, setEdit] = useState('');
  const [newProvider, setNewProvider] = useState<ProviderId>('ark');
  const [newId, setNewId] = useState('');
  const [selected, setSelected] = useState<Partial<Record<ProviderId, string>>>(
    {},
  );
  const [testConsent, setTestConsent] = useState(false);
  const [summary, setSummary] = useState<Summary>();
  const { busy, run } = useAction(notify);
  const [aiEnabled, setAIEnabled] = useState(data.settings[0].aiEnabled);
  async function refresh() {
    const value = await aiFetch<CenterStatus>('/api/ai', undefined, 'GET');
    setStatus(value);
    setConfig(value.config);
    window.dispatchEvent(
      new CustomEvent('dailyflow-ai-status', { detail: value }),
    );
    if (value.admin)
      setSummary(await aiFetch<Summary>('/api/ai/admin', undefined, 'GET'));
    else setSummary(undefined);
  }
  useEffect(() => {
    let active = true;
    aiFetch<CenterStatus>('/api/ai', undefined, 'GET')
      .then((value) => {
        if (active) {
          setStatus(value);
          setConfig(value.config);
        }
      })
      .catch(() => {
        if (active)
          setStatus({
            enabled: false,
            reason: '服务暂不可连接，本地功能仍可使用',
            provider: 'none',
          });
      });
    return () => {
      active = false;
    };
  }, []);
  function updateModel(model: Model, update: Partial<Model>) {
    if (config)
      setConfig({
        ...config,
        models: config.models.map((m) =>
          m.provider === model.provider && m.id === model.id
            ? { ...m, ...update, source: 'admin' }
            : m,
        ),
      });
  }
  const options = (
    value: Selection | null,
    onChange: (value: Selection | null) => void,
    task: string,
  ) => (
    <select
      aria-label={`${task}模型`}
      value={value ? `${value.provider}|${value.model}` : ''}
      onChange={(e) => {
        const [provider, model] = e.target.value.split('|');
        onChange(provider ? { provider: provider as ProviderId, model } : null);
      }}
    >
      <option value="">使用管理员默认 / 未指定</option>
      {config?.models
        .filter(
          (m) =>
            m.capabilities.text &&
            (task.includes('图片')
              ? m.capabilities.image && m.capabilities.structured
              : task.includes('总结')
                ? m.capabilities.structured
                : true),
        )
        .map((m) => (
          <option key={`${m.provider}/${m.id}`} value={`${m.provider}|${m.id}`}>
            {selectionLabel({ provider: m.provider, model: m.id }, config)}
            {status?.configured?.[m.provider] ? '' : '（未配密钥）'}
          </option>
        ))}
    </select>
  );
  return (
    <section className="card settings-card ai-center" aria-label="AI 模型中心">
      <div className="row between wrap">
        <div>
          <h3>
            <Sparkles size={19} />
            AI 模型中心
          </h3>
          <p className="muted small">为每一项任务，选择合适的智能伙伴。</p>
        </div>
        <span className="pill">
          {status?.authenticated
            ? status.admin
              ? '管理员已登录'
              : '访问身份已登录'
            : '本地功能可用'}
        </span>
      </div>
      <p className="notice">
        {status?.reason || '正在读取服务配置…'}{' '}
        {status?.authenticated && !status.persistent
          ? '开发环境配置仅在服务进程内保存；上线须配置 Redis。'
          : ''}
      </p>
      {!status?.authenticated ? (
        <form
          className="ai-login"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              try {
                await aiFetch('/api/ai/session', { code: password, role });
                await refresh();
                notify('AI 访问身份已登录');
              } finally {
                setPassword('');
              }
            });
          }}
        >
          <Field label="访问身份">
            <select
              aria-label="AI访问身份"
              value={role}
              onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            >
              <option value="user">使用者</option>
              <option value="admin">管理员</option>
            </select>
          </Field>
          <Field label="网站访问口令（不是 API Key）">
            <input
              aria-label="AI访问口令"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              maxLength={256}
              required
            />
          </Field>
          <Button type="submit" disabled={busy}>
            登录 AI 身份
          </Button>
          <p className="notice">
            口令仅用于建立一小时的 HttpOnly
            会话，不写入本地存储。个人版使用独立的使用者与管理员口令。
          </p>
        </form>
      ) : (
        <div className="row wrap">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run(refresh)}
          >
            <RefreshCw size={15} />
            刷新状态
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await aiFetch('/api/ai/session', undefined, 'DELETE');
                await refresh();
              })
            }
          >
            <LogOut size={15} />
            退出身份
          </Button>
        </div>
      )}
      <div className="ai-provider-grid">
        {providerIds
          .filter((p) => p !== 'custom' || !!config?.custom)
          .map((id) => {
            const models =
              config?.models.filter((m) => m.provider === id) || [];
            const selectedId = selected[id] || models[0]?.id || '';
            const connection = config?.connections[id];
            const currentConnection =
              connection?.model === selectedId ? connection : undefined;
            const configured = status?.configured?.[id];
            return (
              <article className="ai-provider" key={id}>
                <div className="row between">
                  <div className="row">
                    <span className="ai-provider-icon" aria-hidden="true">
                      {providers[id].symbol}
                    </span>
                    <b>
                      {id === 'custom'
                        ? config?.custom?.name
                        : providers[id].name}
                    </b>
                  </div>
                  <span
                    className={`pill ${currentConnection?.status === 'success' && configured ? 'ai-success' : ''}`}
                  >
                    {!status?.authenticated
                      ? '登录后查看'
                      : !configured
                        ? '未配置'
                        : currentConnection
                          ? connectionNames[currentConnection.status]
                          : '待测试'}
                  </span>
                </div>
                <p className="small muted">
                  密钥：
                  {!status?.authenticated
                    ? '仅登录后返回配置状态'
                    : configured
                      ? '已配置 · 不可读取'
                      : '未配置'}{' '}
                  · {models.length} 个已登记模型
                </p>
                {models.length ? (
                  <Field label={`${providers[id].name}测试模型`}>
                    <select
                      aria-label={`${providers[id].name}测试模型`}
                      value={selectedId}
                      onChange={(e) =>
                        setSelected({ ...selected, [id]: e.target.value })
                      }
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {m.id}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <p className="notice">
                    {id === 'ark'
                      ? '请管理员登记账号可用的模型或推理端点 ID。'
                      : '暂无登记模型。'}
                  </p>
                )}
                {models.find((m) => m.id === selectedId) && (
                  <div className="ai-capabilities">
                    {Object.entries(
                      models.find((m) => m.id === selectedId)!.capabilities,
                    ).map(([key, supported]) => (
                      <span
                        key={key}
                        className={supported ? '' : 'unsupported'}
                      >
                        {capabilityNames[key as keyof typeof capabilityNames]}{' '}
                        {supported ? '✓' : '—'}
                      </span>
                    ))}
                  </div>
                )}
                {connection && configured && (
                  <p className="notice">
                    {connection.message} · {connection.model}
                    <br />
                    测试时间：
                    {new Date(connection.checkedAt).toLocaleString('zh-CN')}
                    。该状态仅代表当时的测试。
                  </p>
                )}
                {status?.admin && (
                  <div className="row wrap">
                    <Button
                      variant="secondary"
                      disabled={
                        busy || !configured || !selectedId || !testConsent
                      }
                      onClick={() =>
                        void run(async () => {
                          const result = await aiFetch<{
                            connection: { message: string };
                          }>('/api/ai/admin', {
                            action: 'test',
                            provider: id,
                            model: selectedId,
                            requestId: crypto.randomUUID(),
                            consent: true,
                          });
                          notify(result.connection.message);
                          await refresh();
                        })
                      }
                    >
                      测试连接
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy || !configured}
                      onClick={() =>
                        void run(async () => {
                          const result = await aiFetch<{
                            config: AIConfig;
                            count: number;
                          }>('/api/ai/admin', {
                            action: 'models',
                            provider: id,
                          });
                          setConfig(result.config);
                          notify(
                            id === 'ark'
                              ? '方舟使用账号专属 ID，请手动登记模型'
                              : `已查询 ${result.count} 个模型；新增能力需核实后启用`,
                          );
                        })
                      }
                    >
                      更新模型列表
                    </Button>
                  </div>
                )}
                {providers[id].url && (
                  <a
                    className="ai-platform-link small"
                    href={providers[id].url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    官方密钥平台 ↗
                  </a>
                )}
              </article>
            );
          })}
      </div>
      {status?.authenticated && config && (
        <>
          <h4>我的模型分配</h4>
          <div className="form-grid">
            <Field label="使用模式">
              <select
                aria-label="AI使用模式"
                value={preferences.mode}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    mode: e.target.value as typeof preferences.mode,
                  })
                }
              >
                <option value="manual">手动选择</option>
                <option value="auto">智能推荐（每次选择一个模型）</option>
                <option value="local">本地规则（不传输数据）</option>
              </select>
            </Field>
            <Field label="成本偏好">
              <select
                aria-label="AI成本偏好"
                value={preferences.cost}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    cost: e.target.value as typeof preferences.cost,
                  })
                }
              >
                <option value="economy">节约费用</option>
                <option value="balanced">均衡 · 优先默认模型</option>
                <option value="quality">质量 · 优先管理员指定模型</option>
              </select>
            </Field>
          </div>
          <div className="ai-task-grid">
            {(['chat', 'image', 'weekly'] as const).map((task, i) => (
              <Field key={task} label={['默认聊天', '图片识别', '每周总结'][i]}>
                {options(
                  preferences[task],
                  (selection) =>
                    setPreferences({ ...preferences, [task]: selection }),
                  ['聊天', '图片', '总结'][i],
                )}
              </Field>
            ))}
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={aiEnabled}
              disabled={busy}
              onChange={(e) => {
                const checked = e.target.checked;
                const previous = aiEnabled;
                setAIEnabled(checked);
                void run(async () => {
                  try {
                    await saveRecord('settings', {
                      ...data.settings[0],
                      aiEnabled: checked,
                    });
                  } catch (error) {
                    setAIEnabled(previous);
                    throw error;
                  }
                });
              }}
            />
            允许使用 AI 功能
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={preferences.failover}
              onChange={(e) =>
                setPreferences({ ...preferences, failover: e.target.checked })
              }
            />
            显式开启自动故障切换，允许在调用前授权的备用服务之间传输必要数据
          </label>
          {preferences.failover && (
            <>
              <p className="notice">
                备用模型可能由不同公司提供、分别计费。每次调用仍须确认具体服务商；流式回复已开始时不会切换。
              </p>
              {[0, 1, 2].map((index) => (
                <Field key={index} label={`备用模型 ${index + 1}`}>
                  {options(
                    preferences.backups[index] || null,
                    (choice) => {
                      const backups = [...preferences.backups];
                      if (choice) backups[index] = choice;
                      else backups.splice(index, 1);
                      setPreferences({
                        ...preferences,
                        backups: backups.filter(Boolean),
                      });
                    },
                    '备用',
                  )}
                </Field>
              ))}
            </>
          )}
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await saveRecord('settings', {
                  ...data.settings[0],
                  aiPreferences: preferencesSchema.parse(preferences),
                });
                notify('模型偏好已保存，无需重新部署');
              })
            }
          >
            保存我的模型偏好
          </Button>
          {status.admin && (
            <details className="ai-admin">
              <summary>
                <ShieldCheck size={17} />
                管理员配置
              </summary>
              <p className="notice">
                密钥只在 Vercel
                环境变量配置。下列服务配置保存至服务端；模型能力需依据官方文档核实。单价以美元
                / 百万 Token
                填写，仅用于应用估算，缓存优惠等以服务商账单为准。未知单价会暂停付费请求。
              </p>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={testConsent}
                  onChange={(e) => setTestConsent(e.target.checked)}
                />
                允许测试按钮向对应服务商发送“连接测试”；测试会产生少量费用并计入限额
              </label>
              <div className="ai-task-grid">
                {(['chat', 'image', 'weekly'] as const).map((task, i) => (
                  <Field
                    key={task}
                    label={`网站默认${['聊天', '图片识别', '总结'][i]}`}
                  >
                    {options(
                      config.defaults[task],
                      (selection) =>
                        setConfig({
                          ...config,
                          defaults: { ...config.defaults, [task]: selection },
                        }),
                      ['默认聊天', '默认图片', '默认总结'][i],
                    )}
                  </Field>
                ))}
              </div>
              <Field label="编辑模型与费用">
                <select
                  aria-label="编辑模型与费用"
                  value={edit}
                  onChange={(e) => setEdit(e.target.value)}
                >
                  <option value="">选择一个已登记模型</option>
                  {config.models.map((m) => (
                    <option
                      key={`${m.provider}/${m.id}`}
                      value={`${m.provider}|${m.id}`}
                    >
                      {selectionLabel({ provider: m.provider, model: m.id })}
                    </option>
                  ))}
                </select>
              </Field>
              {config.models
                .filter((m) => `${m.provider}|${m.id}` === edit)
                .map((m) => (
                  <div className="ai-model-editor" key={edit}>
                    <p className="small">
                      {m.id} · 来源：
                      {m.source === 'official'
                        ? '官方文档'
                        : m.source === 'discovered'
                          ? '接口发现，能力待核实'
                          : '管理员维护'}
                    </p>
                    <div className="row wrap">
                      {Object.entries(m.capabilities).map(
                        ([key, supported]) => (
                          <label className="check-field" key={key}>
                            <input
                              type="checkbox"
                              checked={supported}
                              onChange={(e) =>
                                updateModel(m, {
                                  capabilities: {
                                    ...m.capabilities,
                                    [key]: e.target.checked,
                                  },
                                })
                              }
                            />
                            {
                              capabilityNames[
                                key as keyof typeof capabilityNames
                              ]
                            }
                          </label>
                        ),
                      )}
                    </div>
                    <div className="form-grid">
                      <Field label="输入单价（USD / 百万 Token）">
                        <input
                          aria-label="输入单价"
                          type="number"
                          min="0"
                          max="10000"
                          step="0.001"
                          value={m.inputPrice ?? ''}
                          onChange={(e) =>
                            updateModel(m, {
                              inputPrice:
                                e.target.value === ''
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="输出单价（USD / 百万 Token）">
                        <input
                          aria-label="输出单价"
                          type="number"
                          min="0"
                          max="10000"
                          step="0.001"
                          value={m.outputPrice ?? ''}
                          onChange={(e) =>
                            updateModel(m, {
                              outputPrice:
                                e.target.value === ''
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <p className="notice">
                      填 0 表示你已确认该项目/模型免费，不能用 0 代替未知价格。
                    </p>
                  </div>
                ))}
              <h4>登记模型 ID</h4>
              <div className="form-grid">
                <Field label="服务商">
                  <select
                    aria-label="登记模型服务商"
                    value={newProvider}
                    onChange={(e) =>
                      setNewProvider(e.target.value as ProviderId)
                    }
                  >
                    {providerIds.map((p) => (
                      <option key={p} value={p}>
                        {providers[p].name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="官方模型 ID / 方舟推理端点 ID">
                  <input
                    aria-label="登记模型ID"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    maxLength={160}
                  />
                </Field>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    if (!newId.trim())
                      throw new Error('请输入官方模型或端点 ID');
                    if (
                      config.models.some(
                        (m) =>
                          m.provider === newProvider && m.id === newId.trim(),
                      )
                    )
                      throw new Error('模型已经存在');
                    const m: Model = {
                      provider: newProvider,
                      id: newId.trim(),
                      name: newId.trim(),
                      source: 'admin',
                      capabilities: {
                        text: true,
                        image: false,
                        stream: false,
                        structured: false,
                        tools: false,
                      },
                      inputPrice: null,
                      outputPrice: null,
                    };
                    setConfig({ ...config, models: [...config.models, m] });
                    setEdit(`${m.provider}|${m.id}`);
                    setNewId('');
                  })
                }
              >
                <Plus size={15} />
                添加到待保存配置
              </Button>
              <h4>自定义服务商（OpenAI Chat Completions 协议）</h4>
              <p className="notice">
                仅管理员可管理。先在服务端配置 CUSTOM_AI_API_KEY 和
                AI_CUSTOM_ALLOWED_HOSTS 精确域名白名单。HTTPS
                接口禁止内网、元数据、重定向和 DNS 重绑定。
              </p>
              <Button
                variant="secondary"
                onClick={() =>
                  setConfig({
                    ...config,
                    custom: config.custom
                      ? null
                      : {
                          name: '我的兼容服务',
                          baseURL: 'https://api.example.com/v1',
                          protocol: 'openai-chat',
                        },
                  })
                }
              >
                {config.custom ? '停用自定义服务' : '添加自定义服务商'}
              </Button>
              {config.custom && (
                <div className="form-grid">
                  <Field label="自定义名称">
                    <input
                      aria-label="自定义名称"
                      maxLength={60}
                      value={config.custom.name}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          custom: { ...config.custom!, name: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label="API Base URL">
                    <input
                      aria-label="API Base URL"
                      type="url"
                      value={config.custom.baseURL}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          custom: {
                            ...config.custom!,
                            baseURL: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              )}
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await aiFetch('/api/ai/admin', { action: 'save', config });
                    await refresh();
                    notify('服务端模型配置已保存');
                  })
                }
              >
                保存管理员配置
              </Button>
            </details>
          )}
          {status.admin && (
            <div className="ai-usage">
              <div className="row between wrap">
                <h4>调用与费用</h4>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setSummary(
                        await aiFetch<Summary>(
                          '/api/ai/admin',
                          undefined,
                          'GET',
                        ),
                      ),
                    )
                  }
                >
                  查看用量
                </Button>
              </div>
              {summary ? (
                <>
                  <p>
                    本月已预留 / 估算 ${summary.estimatedUSD.toFixed(4)}，预算 $
                    {summary.limits.usd} · {summary.calls} 次调用
                  </p>
                  <p className="small muted">
                    {Object.entries(summary.providers || {})
                      .map(
                        ([id, count]) =>
                          `${providers[id as ProviderId]?.name || id} ${count} 次`,
                      )
                      .join(' · ') || '尚无服务商调用'}
                  </p>
                  <p className="notice">
                    每日最多 {summary.limits.daily} 次，月度最多{' '}
                    {summary.limits.monthly} 次。准确 Token
                    与估算费用分别标注；超时等未知用量保留最大预留费用。服务商账单为最终依据。
                  </p>
                  <div className="ai-usage-list">
                    {summary.entries.slice(0, 10).map((entry, i) => (
                      <p className="small" key={i}>
                        {providers[entry.provider as ProviderId]?.name} ·{' '}
                        {entry.model} ·{' '}
                        {entry.exact
                          ? `${entry.input} 输入 / ${entry.output} 输出 Token（服务商返回）`
                          : 'Token 未知，保守预留'}{' '}
                        · 估算 ${entry.estimatedUSD.toFixed(5)} ·{' '}
                        {entry.outcome}
                      </p>
                    ))}
                  </div>
                </>
              ) : (
                <p className="notice">
                  点击查看本月统计，不保存提示词、健康记录或图片。
                </p>
              )}
            </div>
          )}
        </>
      )}
      <p className="notice">
        未配置 API
        时继续使用本地统计。连接成功只在真实测试通过后显示，模型列表与 Mock
        测试不代表已连接。
      </p>
    </section>
  );
}
