'use client';
import { useState } from 'react';
import { Sparkles, ArrowUp, LoaderCircle, Trash2 } from 'lucide-react';
import type { Tables } from '@/lib/schemas';
import { metadata, saveRecord, removeRecord } from '@/lib/db';
import { localWeeklyReport, coachContext } from '@/lib/insights';
import { totalNutrition } from '@/lib/nutrition';
import {
  textResultSchema,
  weeklyResultSchema,
  formatWeekly,
} from '@/lib/ai/contracts';
import { requestAIWithMeta } from '@/lib/ai/client';
import { selectionLabel, type ProviderId } from '@/lib/ai/catalog';
import { AIConsent, useAIRoute } from './ai-consent';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { useAction, type Notify } from './shared';
export function CoachDialog({
  data,
  date,
  notify,
  onClose,
  aiReady,
}: {
  data: Tables;
  date: string;
  notify: Notify;
  onClose: () => void;
  aiReady: boolean;
  code: string;
}) {
  const [question, setQuestion] = useState('');
  const [progress, setProgress] = useState('');
  const chatRoute = useAIRoute(
    data.settings[0].aiPreferences,
    'coach',
    false,
    aiReady,
  );
  const weeklyRoute = useAIRoute(
    data.settings[0].aiPreferences,
    'weekly',
    false,
    aiReady,
  );
  const { busy, run } = useAction(notify);
  const history = [...data.conversations]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-12);
  async function ask(kind: 'coach' | 'weekly', text: string) {
    await run(async () => {
      if (!text.trim()) throw new Error('请输入问题');
      let answer: string;
      let provider: 'local' | ProviderId = 'local';
      let model: string | undefined;
      setProgress('');
      if (aiReady) {
        const route = kind === 'weekly' ? weeklyRoute : chatRoute;
        const output = await requestAIWithMeta(
          {
            task: kind,
            text,
            context: coachContext(data, date),
            ...route.authorization(),
          },
          kind === 'coach' ? setProgress : undefined,
        );
        answer =
          kind === 'weekly'
            ? formatWeekly(weeklyResultSchema.parse(output.result))
            : textResultSchema.parse(output.result).answer;
        provider = output.provider;
        model = output.model;
        if (output.fallbackErrors.length)
          notify(
            `已按授权切换备用模型：${output.provider}。主模型错误：${output.fallbackErrors[0]}`,
          );
      } else if (kind === 'weekly') answer = localWeeklyReport(data, date);
      else {
        const total = totalNutrition(data.meals.filter((m) => m.date === date));
        answer = `【事实】${date}已记录${data.meals.filter((m) => m.date === date).length}项食物。\n\n【估算】记录内蛋白质约${total.protein.toFixed(1)}g，目标为${data.targets[0].protein}g。没有记录的餐食无法判断。\n\n【建议】可以在规律三餐中搭配蛋、奶、豆制品等食物，并继续记录。\n\n当前为本地规则提示，未调用AI，不能理解开放式问题。正式AI需要部署者配置后启用。`;
      }
      await saveRecord('conversations', {
        ...metadata(),
        kind,
        question: text,
        answer,
        provider,
        model,
      });
      setQuestion('');
      chatRoute.setConsent(false);
      weeklyRoute.setConsent(false);
    });
  }
  return (
    <Dialog
      title="轻律教练"
      description="基于你选择分享的记录，陪你找到更舒服的节奏。"
      onClose={onClose}
    >
      <div className="coach-state">
        <span className="coach-icon">
          <Sparkles size={22} />
        </span>
        <div>
          <b>
            {aiReady
              ? selectionLabel(chatRoute.plan?.selection)
              : '本地规则 · 未调用AI'}
          </b>
          <p>
            {aiReady
              ? '回复会区分事实、估算与建议'
              : '常规功能可用；这里提供明确标注的本地统计'}
          </p>
        </div>
      </div>
      <div className="chat-history" role="log" aria-live="polite">
        {!history.length && (
          <div className="coach-welcome">
            <h3>从一个小问题开始。</h3>
            <p>
              今天吃得怎么样？训练要不要增加难度？
              <br />
              记录越完整，建议越有依据。
            </p>
          </div>
        )}
        {history.map((item) => (
          <div className="chat-pair" key={item.id}>
            <div className="chat-question">{item.question}</div>
            <div className="chat-answer">
              <span>
                {item.provider !== 'local'
                  ? `AI回复 · ${selectionLabel({ provider: item.provider, model: item.model || '历史模型' })}`
                  : '本地规则提示'}{' '}
                · {item.createdAt.slice(0, 10)}
              </span>
              <p>{item.answer}</p>
              <button
                className="icon-button"
                aria-label="删除这条对话"
                onClick={() =>
                  void run(async () => {
                    await removeRecord('conversations', item.id);
                    notify('对话已删除');
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {busy && (
          <div className="row muted">
            <LoaderCircle size={16} className="spin" />
            正在生成，已接收 {progress.length} 字符…
          </div>
        )}
      </div>
      {busy && progress && (
        <div className="ai-stream" aria-live="polite">
          {progress}
        </div>
      )}
      <div className="row wrap prompt-chips">
        {['今天蛋白质够了吗？', '下次训练怎么调整？'].map((q) => (
          <button disabled={busy} key={q} onClick={() => setQuestion(q)}>
            {q}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => void ask('weekly', '最近7天复盘')}
        >
          生成7天复盘
        </button>
      </div>
      {aiReady && (
        <>
          <AIConsent
            route={chatRoute}
            description="本次问题、年龄、身高、目标及近两周必要的饮食/习惯/身体统计与训练组数，不含姓名、照片或完整对话"
          />
          <details>
            <summary>每周总结的数据授权</summary>
            <AIConsent
              route={weeklyRoute}
              description="最近7天记录与前周对比、年龄、身高和目标，不含姓名、照片或完整对话"
            />
          </details>
        </>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void ask('coach', question);
        }}
      >
        <input
          aria-label="向教练提问"
          maxLength={1000}
          placeholder={
            aiReady ? '写下你的问题…' : '可查看本地统计，或生成7天复盘…'
          }
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button type="submit" aria-label="发送问题" disabled={busy}>
          <ArrowUp size={20} />
        </Button>
      </form>
      <p className="notice">
        所有建议用于日常生活参考。AI不会自动修改目标或删除记录。
      </p>
    </Dialog>
  );
}
