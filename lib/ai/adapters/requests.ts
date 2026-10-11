import type { ProviderInput } from '../provider';
import { portableSchema } from '../schema';

export function openAIRequest(input: ProviderInput) {
  return {
    model: input.model,
    instructions: input.instructions,
    max_output_tokens: input.maxOutput || 1800,
    store: false,
    input: [
      {
        role: 'user' as const,
        content: [
          { type: 'input_text' as const, text: input.text },
          ...(input.image
            ? [
                {
                  type: 'input_image' as const,
                  image_url: input.image,
                  detail: 'high' as const,
                },
              ]
            : []),
        ],
      },
    ],
    ...(input.schema
      ? {
          text: {
            format: {
              type: 'json_schema' as const,
              name: 'dailyflow_result',
              strict: true,
              schema: portableSchema(input.schema),
            },
          },
        }
      : {}),
  };
}
export function geminiRequest(input: ProviderInput) {
  const image = input.image?.match(/^data:([^;]+);base64,(.+)$/);
  return {
    model: input.model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: input.text },
          ...(image
            ? [{ inlineData: { mimeType: image[1], data: image[2] } }]
            : []),
        ],
      },
    ],
    config: {
      systemInstruction: input.instructions,
      maxOutputTokens: input.maxOutput || 1800,
      abortSignal: input.signal,
      ...(input.schema
        ? {
            responseMimeType: 'application/json',
            responseJsonSchema: portableSchema(input.schema),
          }
        : {}),
    },
  };
}
export function claudeRequest(
  input: ProviderInput,
  stream: boolean,
): Record<string, unknown> {
  const image = input.image?.match(/^data:([^;]+);base64,(.+)$/);
  return {
    model: input.model,
    system: input.instructions,
    max_tokens: input.maxOutput || 1800,
    stream,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: input.text },
          ...(image
            ? [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: image[1],
                    data: image[2],
                  },
                },
              ]
            : []),
        ],
      },
    ],
    ...(input.schema
      ? {
          output_config: {
            format: {
              type: 'json_schema',
              schema: portableSchema(input.schema),
            },
          },
        }
      : {}),
  };
}
function chatRequest(
  input: ProviderInput,
  stream: boolean,
): Record<string, unknown> {
  return {
    model: input.model,
    max_tokens: input.maxOutput || 1800,
    stream,
    messages: [
      {
        role: 'system',
        content:
          input.instructions +
          (input.schema
            ? '\n必须返回 JSON，符合此结构：' +
              JSON.stringify(portableSchema(input.schema))
            : ''),
      },
      {
        role: 'user',
        content: input.image
          ? [
              { type: 'text', text: input.text },
              { type: 'image_url', image_url: { url: input.image } },
            ]
          : input.text,
      },
    ],
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(input.schema ? { response_format: { type: 'json_object' } } : {}),
  };
}
export function deepseekRequest(input: ProviderInput, stream: boolean) {
  return { ...chatRequest(input, stream), thinking: { type: 'disabled' } };
}
export function moonshotRequest(input: ProviderInput, stream: boolean) {
  return {
    ...chatRequest(input, stream),
    ...(input.model === 'kimi-k2.5' ? { thinking: { type: 'disabled' } } : {}),
  };
}
export function arkRequest(input: ProviderInput, stream: boolean) {
  const body = chatRequest(input, stream);
  delete body.max_tokens;
  return {
    ...body,
    max_completion_tokens: input.maxOutput || 1800,
    thinking: { type: 'disabled' },
  };
}
export function customRequest(input: ProviderInput, stream: boolean) {
  return chatRequest(input, stream);
}
export const compatibleRequests = {
  deepseek: deepseekRequest,
  moonshot: moonshotRequest,
  ark: arkRequest,
  custom: customRequest,
};
