// GENERATED CODE! DO NOT MODIFY BY HAND!
import type { ClientRequest } from './types/ClientRequest.js';
import type { ServerRequest } from './types/ServerRequest.js';
import type { ServerNotification } from './types/ServerNotification.js';
import type { InitializeResponse as Result0 } from './types/InitializeResponse.js';
export declare function request0Params(
  value: unknown,
): value is Extract<ClientRequest, { method: 'initialize' }>['params'];
export declare function request0Result(value: unknown): value is Result0;
import type { ThreadStartResponse as Result1 } from './types/v2/ThreadStartResponse.js';
export declare function request1Params(
  value: unknown,
): value is Extract<ClientRequest, { method: 'thread/start' }>['params'];
export declare function request1Result(value: unknown): value is Result1;
import type { ThreadResumeResponse as Result2 } from './types/v2/ThreadResumeResponse.js';
export declare function request2Params(
  value: unknown,
): value is Extract<ClientRequest, { method: 'thread/resume' }>['params'];
export declare function request2Result(value: unknown): value is Result2;
import type { TurnStartResponse as Result3 } from './types/v2/TurnStartResponse.js';
export declare function request3Params(
  value: unknown,
): value is Extract<ClientRequest, { method: 'turn/start' }>['params'];
export declare function request3Result(value: unknown): value is Result3;
import type { TurnInterruptResponse as Result4 } from './types/v2/TurnInterruptResponse.js';
export declare function request4Params(
  value: unknown,
): value is Extract<ClientRequest, { method: 'turn/interrupt' }>['params'];
export declare function request4Result(value: unknown): value is Result4;
import type { ThreadReadResponse as Result5 } from './types/v2/ThreadReadResponse.js';
export declare function request5Params(
  value: unknown,
): value is Extract<ClientRequest, { method: 'thread/read' }>['params'];
export declare function request5Result(value: unknown): value is Result5;
import type { DynamicToolCallResponse as ServerResult0 } from './types/v2/DynamicToolCallResponse.js';
export declare function serverRequest0Params(
  value: unknown,
): value is Extract<ServerRequest, { method: 'item/tool/call' }>['params'];
export declare function serverRequest0Result(value: unknown): value is ServerResult0;
export declare function notification0(
  value: unknown,
): value is Extract<ServerNotification, { method: 'item/agentMessage/delta' }>['params'];
export declare function notification1(
  value: unknown,
): value is Extract<ServerNotification, { method: 'item/reasoning/summaryTextDelta' }>['params'];
export declare function notification2(
  value: unknown,
): value is Extract<ServerNotification, { method: 'turn/completed' }>['params'];
export declare function notification3(
  value: unknown,
): value is Extract<ServerNotification, { method: 'item/started' }>['params'];
export declare function notification4(
  value: unknown,
): value is Extract<ServerNotification, { method: 'item/completed' }>['params'];
