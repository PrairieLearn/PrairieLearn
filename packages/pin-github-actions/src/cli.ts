#!/usr/bin/env node

import { pinGithubActions } from './index.js';

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  await pinGithubActions({ checkOnly });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
