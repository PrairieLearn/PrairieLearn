import * as error from '@prairielearn/error';

import { config } from './config.js';

export function canSendOpsMessages(): boolean {
  return !!config.slackOpsWebhookUrl;
}

async function sendSlackWebhookMessage(msg: string, webhookUrl: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    body: JSON.stringify({ text: msg }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new error.AugmentedError('Error sending message', {
      data: {
        responseCode: response.status,
        responseText: await response.text(),
      },
    });
  }
}

export async function sendOpsMessage(msg: string): Promise<void> {
  const webhookUrl = config.slackOpsWebhookUrl;
  if (!webhookUrl) return;

  await sendSlackWebhookMessage(msg, webhookUrl);
}

/**
 * Send a message to the course requests channel on Slack.
 * @param msg String message to send.
 */
export async function sendCourseRequestMessage(msg: string): Promise<void> {
  const webhookUrl = config.slackCourseRequestWebhookUrl;
  if (!webhookUrl) return;

  await sendSlackWebhookMessage(msg, webhookUrl);
}
