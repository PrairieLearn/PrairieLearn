#!/usr/bin/env node

import { createInterface } from 'node:readline';

import { handleInput } from './executor-lib.js';
import { CodeCallerNative } from './lib/code-caller/code-caller-native.js';

let questionTimeoutMilliseconds = Number.parseInt(process.env.QUESTION_TIMEOUT_MILLISECONDS ?? '');
if (Number.isNaN(questionTimeoutMilliseconds)) {
  questionTimeoutMilliseconds = 10000;
}

let pingTimeoutMilliseconds = Number.parseInt(process.env.PING_TIMEOUT_MILLISECONDS ?? '');
if (Number.isNaN(pingTimeoutMilliseconds)) {
  pingTimeoutMilliseconds = 60_000;
}

async function prepareCodeCaller() {
  return await CodeCallerNative.create({
    dropPrivileges: true,
    questionTimeoutMilliseconds,
    pingTimeoutMilliseconds,
    errorLogger: console.error,
  });
}

process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));

(async () => {
  let codeCaller = await prepareCodeCaller();

  // Our overall loop looks like this: read a line of input from stdin, spin
  // off a python worker to handle it, and write the results back to stdout.
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // Once the readline interface closes, we can't get any more input; die
  // immediately to allow our container to be removed.
  rl.on('close', () => process.exit(0));

  for await (const line of rl) {
    const results = await handleInput(line, codeCaller);
    const { needsFullRestart, ...rest } = results;
    process.stdout.write(JSON.stringify(rest) + '\n');
    if (needsFullRestart) {
      codeCaller.done();
      codeCaller = await prepareCodeCaller();
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
