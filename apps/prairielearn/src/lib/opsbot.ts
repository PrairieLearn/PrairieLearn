import detectMocha from 'detect-mocha';

import { makeWithData } from '@prairielearn/error';
import { config } from './config';
import { logger } from '@prairielearn/logger';
import fetch, { Response } from 'node-fetch';

export function canSendMessages() {
  return detectMocha() || !!config.secretSlackOpsBotEndpoint;
}

export async function sendMessage(msg: string): Promise<Response | null> {
  if (detectMocha()) {
    return new Response('Dummy test body', { status: 200, statusText: 'OK' });
  }

  // No-op if there's no url specified
  if (!config.secretSlackOpsBotEndpoint) {
    return null;
  }

  return fetch(config.secretSlackOpsBotEndpoint, {
    method: 'POST',
    body: JSON.stringify({ text: msg }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * General interface to send a message from PrairieLearn to Slack.
 * @param msg String message to send.
 * @param channel Channel to send to.  Private channels must have the bot added.
 */
export async function sendSlackMessage(
  msg: string,
  channel?: string | null | undefined,
): Promise<Response | null> {
  const token = config.secretSlackToken;

  // Log the message if there's no token specified
  if (!token || !channel) {
    logger.info(`Slack message:\n${msg}`);
    return null;
  }

  if (detectMocha()) {
    return new Response('Dummy test body', { status: 200, statusText: 'OK' });
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      text: msg,
      channel: channel,
      as_user: true,
    }),
  });

  if (!response.ok) {
    throw makeWithData(`Error sending message to ${channel}`, { body: await response.json() });
  }
  return response;
}

/**
 * Send a message to the secret course requests channel on Slack.
 * @param msg String message to send.
 * @param callback Function that is called after the message is sent.
 * Called with callback(err, response, body)
 */
export async function sendCourseRequestMessage(msg) {
  return sendSlackMessage(msg, config.secretSlackCourseRequestChannel);
}
