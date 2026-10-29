import { DirectoryBackupGateway } from '@cloudflare/sandbox';
import * as Sentry from '@sentry/cloudflare';

import { Conversation as ConversationAgent } from './conversation/conversation.js';
import app from './http/routes.js';
import { sentryOptions } from './monitoring.js';
import {
  CourseAgentGitHubOutbound as GitHubOutbound,
  CourseAgentModelOutbound as ModelOutbound,
  CourseSandbox as Sandbox,
} from './sandbox/sandbox.js';

export { DirectoryBackupGateway };
export class Conversation extends Sentry.instrumentAgentWithSentry(
  sentryOptions,
  ConversationAgent,
) {}
export class CourseSandbox extends Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  Sandbox,
) {}
export class CourseAgentGitHubOutbound extends Sentry.withSentry(sentryOptions, GitHubOutbound) {}
export class CourseAgentModelOutbound extends Sentry.withSentry(sentryOptions, ModelOutbound) {}

export default Sentry.withSentry(sentryOptions, { fetch: app.fetch });
