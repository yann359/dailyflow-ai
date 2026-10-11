'use client';
import { useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { photoResultSchema } from '@/lib/ai/contracts';
import { requestAI } from '@/lib/ai/client';
import { preparePhoto } from '@/lib/photos';
import type { AIPreferences } from '@/lib/ai/catalog';
import { AIConsent, useAIRoute } from './ai-consent';
import { Field, useAction, type Notify } from './shared';
import { Button } from './ui/button';
export type PhotoFood = z.infer<typeof photoResultSchema>['items'][number];
export function PhotoMeal({
  preferences,
  ready,
  notify,
  draft,
  onDraft,
}: {
  preferences?: AIPreferences;
  ready: boolean;
  notify: Notify;
  draft: PhotoFood[];
  onDraft: (items: PhotoFood[]) => void;
}) {
  const [image, setImage] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const { busy, run } = useAction(notify);
  const route = useAIRoute(preferences, 'photo', true, ready);
  const update = (index: number, value: Partial<PhotoFood>) =>
    onDraft(
      draft.map((item, i) => (i === index ? { ...item, ...value } : item)),
    );
  return (
    <div>
      <Field label="食物照片">
        <input
          type="file"
          aria-label="食物照片"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onDraft([]);
              setImage('');
              route.setConsent(false);
              void run(async () => {
                setImage(await preparePhoto(file));
                onDraft([]);
                setWarnings([]);
                route.setConsent(false);
              });
            }
          }}
        />
      </Field>
      {image && (
        <p className="notice">
          照片已在本机压缩并移除元数据。仅在勾选授权并点击识别后上传。
        </p>
      )}
      {ready ? (
        <AIConsent
          route={route}
          description="当前食物照片，不含身体照片、姓名或历史记录"
        />
      ) : (
        <p className="notice">
          请先在设置 → AI 模型中心登录，并选择支持图像和结构化输出的模型。
        </p>
      )}
      <Button
        variant="secondary"
        disabled={busy || !image || !ready || !route.plan || !route.consent}
        onClick={() =>
          void run(async () => {
            const output = photoResultSchema.parse(
              await requestAI({
                task: 'photo',
                text: '估算照片中的食物和份量；营养统一每100g/ml，所有结果均为估算。',
                image,
                ...route.authorization(),
              }),
            );
            onDraft(output.items);
            setWarnings(output.warnings);
            route.setConsent(false);
            notify('识别完成，请核对份量与营养后确认保存');
          })
        }
      >
        <Camera size={16} />
        识别食物并生成草稿
      </Button>
      {!!draft.length && (
        <p className="notice">
          以下全部为照片估算，无法判断食材配比、油量或准确重量。营养值以每100g/ml填写，保存时按实际份量换算。
        </p>
      )}
      {warnings.map((warning, i) => (
        <p className="notice" key={i}>
          {warning}
        </p>
      ))}
      {draft.map((item, i) => (
        <div className="photo-food-draft" key={i}>
          <div className="row between">
            <b>估算食物 {i + 1}</b>
            <button
              type="button"
              className="icon-button"
              aria-label={`移除照片食物${i + 1}`}
              onClick={() => onDraft(draft.filter((_, index) => index !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <Field label="名称">
            <input
              aria-label={`照片食物${i + 1}名称`}
              required
              maxLength={60}
              value={item.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
          </Field>
          <div className="form-grid">
            <Field label="实际份量（估算，可修改）">
              <input
                aria-label={`照片食物${i + 1}份量`}
                type="number"
                min="0.1"
                max="10000"
                step="0.1"
                required
                value={item.amount}
                onChange={(e) => update(i, { amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="单位">
              <select
                value={item.unit}
                onChange={(e) =>
                  update(i, { unit: e.target.value as 'g' | 'ml' })
                }
              >
                <option value="g">g · 每100g营养</option>
                <option value="ml">ml · 每100ml营养</option>
              </select>
            </Field>
          </div>
          <div className="form-grid">
            {(
              [
                { key: 'calories', label: '热量 kcal' },
                { key: 'protein', label: '蛋白质 g' },
                { key: 'fat', label: '脂肪 g' },
                { key: 'carbs', label: '碳水 g' },
              ] as const
            ).map(({ key, label }) => (
              <Field key={key} label={`每100${item.unit} ${label}`}>
                <input
                  aria-label={`照片食物${i + 1}${key}`}
                  type="number"
                  min="0"
                  max={key === 'calories' ? 10000 : 1000}
                  step="0.1"
                  required
                  value={item.nutrition[key]}
                  onChange={(e) =>
                    update(i, {
                      nutrition: {
                        ...item.nutrition,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <p className="notice">估算说明：{item.note}</p>
        </div>
      ))}
    </div>
  );
}
