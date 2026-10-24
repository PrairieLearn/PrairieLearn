// GENERATED CODE! DO NOT MODIFY BY HAND!
import * as validators from './validators.js';
export const requests = {
  initialize: {
    method: 'initialize',
    params: validators.request0Params,
    result: validators.request0Result,
  },
  'thread/start': {
    method: 'thread/start',
    params: validators.request1Params,
    result: validators.request1Result,
  },
  'thread/resume': {
    method: 'thread/resume',
    params: validators.request2Params,
    result: validators.request2Result,
  },
  'turn/start': {
    method: 'turn/start',
    params: validators.request3Params,
    result: validators.request3Result,
  },
  'turn/interrupt': {
    method: 'turn/interrupt',
    params: validators.request4Params,
    result: validators.request4Result,
  },
} as const;
export const notifications = {
  'item/agentMessage/delta': {
    method: 'item/agentMessage/delta',
    params: validators.notification0,
  },
  'item/reasoning/summaryTextDelta': {
    method: 'item/reasoning/summaryTextDelta',
    params: validators.notification1,
  },
  'turn/completed': { method: 'turn/completed', params: validators.notification2 },
} as const;
