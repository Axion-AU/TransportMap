import { getConfig } from './config';
import type { Env } from './types';

/**
 * LLM calls go through OpenRouter (OpenAI-compatible chat completions API).
 * The model id lives in config (`llm_model`) so it can be swapped without a
 * deploy; the key is the OPENROUTER_API_KEY worker secret.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function llmAvailable(env: Env): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

export interface ChatOptions {
  system: string;
  user: string;
  /** When set, requests strict structured output via response_format. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

export async function chatComplete(env: Env, opts: ChatOptions): Promise<string> {
  const model = await getConfig<string>(env.DB, 'llm_model');
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  };
  if (opts.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
    };
  }
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`openrouter request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('openrouter returned no content');
  return content.trim();
}
