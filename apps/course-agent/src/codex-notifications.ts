import type { AgentMessageDeltaNotification } from './generated/v2/AgentMessageDeltaNotification.js';
import type { ItemCompletedNotification } from './generated/v2/ItemCompletedNotification.js';
import type { ItemStartedNotification } from './generated/v2/ItemStartedNotification.js';
import type { ReasoningSummaryTextDeltaNotification } from './generated/v2/ReasoningSummaryTextDeltaNotification.js';
import type { ThreadTokenUsageUpdatedNotification } from './generated/v2/ThreadTokenUsageUpdatedNotification.js';
import type { TurnCompletedNotification } from './generated/v2/TurnCompletedNotification.js';
import type { TurnStartedNotification } from './generated/v2/TurnStartedNotification.js';

// This is the subset the stream translator consumes, rather than a modified copy
// of Codex's generated CodexNotification union. Payloads remain upstream types.
export type CodexNotification =
  | { method: 'thread/tokenUsage/updated'; params: ThreadTokenUsageUpdatedNotification }
  | { method: 'turn/started'; params: TurnStartedNotification }
  | { method: 'turn/completed'; params: TurnCompletedNotification }
  | { method: 'item/started'; params: ItemStartedNotification }
  | { method: 'item/completed'; params: ItemCompletedNotification }
  | { method: 'item/agentMessage/delta'; params: AgentMessageDeltaNotification }
  | { method: 'item/reasoning/summaryTextDelta'; params: ReasoningSummaryTextDeltaNotification };
