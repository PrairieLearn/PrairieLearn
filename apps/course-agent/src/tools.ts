import { hostToolDefinitions } from '@prairielearn/course-agent-contract';

import { captureApproval, pushSyncTool } from './approval.js';
import type { CodexSandbox } from './codex.js';
import type { DynamicToolCallResponse } from './generated/v2/DynamicToolCallResponse.js';
import type { DynamicToolSpec } from './generated/v2/DynamicToolSpec.js';

/** Sandbox adapters prepare opaque payloads; the PL webserver owns their product workflows. */
export interface ToolAdapter {
  definition: DynamicToolSpec;
  prepare(sandbox: CodexSandbox, args: unknown): Promise<unknown>;
}
const tools: Record<string, ToolAdapter> = {
  push_sync: { definition: pushSyncTool, prepare: captureApproval },
};
export function getTool(name: string): ToolAdapter {
  if (!Object.hasOwn(tools, name)) throw new Error('Unknown tool request.');
  return tools[name];
}
export const toolDefinitions = (development: boolean) => [
  ...(development ? hostToolDefinitions : []),
  ...Object.values(tools).map((tool) => tool.definition),
];
export function toolResult(text: string, success = true): DynamicToolCallResponse {
  return { success, contentItems: [{ type: 'inputText', text }] };
}

export function isPreparedTool(name: string) {
  return Object.hasOwn(tools, name);
}
