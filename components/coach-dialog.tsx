'use client';
import { useState } from 'react';
import { Sparkles, ArrowUp, LoaderCircle, Trash2 } from 'lucide-react';
import type { Tables } from '@/lib/schemas';
import { metadata, saveRecord, removeRecord } from '@/lib/db';
import { localWeeklyReport, coachContext } from '@/lib/insights';
import { totalNutrition } from '@/lib/nutrition';
import { coachResultSchema, formatCoach } from '@/lib/ai/contracts';
import { requestAI } from '@/lib/ai/client';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { useAction, type Notify } from './shared';
export function CoachDialog({
  data,
  date,
  notify,
  onClose,
  aiReady,
  code,
}: {
  data: Tables;
  date: string;
  notify: Notify;
  onClose: () => void;
  aiReady: boolean;
  code: string;
}) {
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState(0);
  const { busy, run } = useAction(notify);
  const history = [...data.conversations]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-12);
  async function ask(kind: 'coach' | 'weekly', text: string) {
    await run(async () => {
      if (aiReady && !consent) throw new Error('请先勾选授权发送最小范围记录');
      if (!text.trim()) throw new Error('请输入问题');
      let answer: string;
      let provider: 'local' | 'openai' = 'local';
      setProgress(0);
      if (aiReady) {
        const result = coachResultSchema.parse(
          await requestAI(
            { task: kind, text, context: coachContext(data, date) },
            code,
            (count) => setProgress(count),
          ),
        );
        answer = formatCoach(result);
        provider = 'openai';
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
      });
      setQuestion('');
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
          <b>{aiReady ? 'OpenAI · 已启用' : '本地规则 · AI未连接'}</b>
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
                {item.provider === 'openai' ? 'AI回复' : '本地规则提示'} ·{' '}
                {item.createdAt.slice(0, 10)}
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
            正在生成，已接收 {progress} 字符…
          </div>
        )}
      </div>
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
        <label className="check-field consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          授权本次向OpenAI发送年龄、身高、目标和近两周统计，不含姓名、照片及完整对话。
        </label>
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
