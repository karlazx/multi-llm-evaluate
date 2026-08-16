import { decrypt } from '../crypto.js';

export interface ModelRow {
  id: number;
  name: string;
  display_name: string | null;
  provider: string | null;
  protocol: string;
  endpoint: string | null;
  api_key_enc: string | null;
  cost_input: string | number | null;
  cost_output: string | number | null;
  thinking: string;
  default_params: Record<string, unknown> | null;
  is_judge: boolean;
  status: string;
}

/** 把一个 DB 模型行 → promptfoo provider（含 key 解密、thinking、透传参数） */
export function buildProvider(model: ModelRow): { id: string; config: Record<string, unknown> } {
  const apiKey = model.api_key_enc ? decrypt(model.api_key_enc) : '';
  const thinking = model.thinking || 'disabled';
  const thinkingStruct = { type: thinking };
  const extra = model.default_params ?? {};

  const base = {
    apiKey,
    apiBaseUrl: model.endpoint ?? '',
    max_tokens: 8192,
    maxTokens: 8192,
    showThinking: false, // 判分只取作答，不含思考
    ...extra,
  };

  switch (model.protocol) {
    case 'openai-v2':
      return {
        id: `openai:responses:${model.name}`,
        config: { ...base, passthrough: { ...(extra as Record<string, unknown>), thinking: thinkingStruct } },
      };
    case 'anthropic':
      return {
        id: `anthropic:messages:${model.name}`,
        config: { ...base, thinking: thinkingStruct },
      };
    case 'openai-v1':
    default:
      return {
        id: `openai:chat:${model.name}`,
        config: { ...base, passthrough: { ...(extra as Record<string, unknown>), thinking: thinkingStruct } },
      };
  }
}

/** 计算成本（USD）：token_in/out 按 1M tokens 单价 */
export function calcCost(
  tokenIn: number,
  tokenOut: number,
  costInput: number | null,
  costOutput: number | null,
): number | null {
  const ci = costInput == null ? null : Number(costInput);
  const co = costOutput == null ? null : Number(costOutput);
  if (ci == null && co == null) return null;
  return ((tokenIn * (ci ?? 0)) / 1_000_000) + ((tokenOut * (co ?? 0)) / 1_000_000);
}
