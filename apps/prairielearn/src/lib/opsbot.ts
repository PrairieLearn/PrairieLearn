import * as error from '@prairielearn/error';
import { config } from './config';
import { logger } from '@prairielearn/logger';
import fetch, { Response } from 'node-fetch';

export function canSendMessages(): boolean {
  return !!config.secretSlackOpsBotEndpoint;
}

export async function sendMessage(msg: string): Promise<null | Response> {
  // No-op if there's no url specified
  if (!config.secretSlackOpsBotEndpoint) {
    return null;
  }

  const response = await fetch(config.secretSlackOpsBotEndpoint, {
    method: 'POST',
    body: JSON.stringify({ text: msg }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw error.makeWithData('Error sending message', {
      responseCode: response.status,
      responseText: await response.text(),
    });
  }

  return response;
}

/**
 * General interface to send a message from PrairieLearn to Slack.
 * @param msg String message to send.
 * @param channel Channel to send to.  Private channels must have the bot added.
 */
export async function sendSlackMessage(
  msg: string,
  channel: string | null,
): Promise<null | Response> {
  const token = config.secretSlackToken;

  // Log the message if there's no token specified
  if (!token || !channel) {
    logger.info(`Slack message:\n${msg}`);
    return null;
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      text: msg,
      channel,
      as_user: true,
    }),
  });

  if (!response.ok) {
    throw error.makeWithData(`Error sending message to ${channel}`, {
      responseCode: response.status,
      responseText: await response.text(),
    });
  }
  return response;
}

/**
 * Send a message to the secret course requests channel on Slack.
 * @param msg String message to send.
 */
export async function sendCourseRequestMessage(msg: string): Promise<null | Response> {
  return sendSlackMessage(msg, config.secretSlackCourseRequestChannel);
}
