#!/usr/bin/env node

import { pinGithubActions } from './index.js';

await pinGithubActions({ checkOnly: process.argv.includes('--check') });
