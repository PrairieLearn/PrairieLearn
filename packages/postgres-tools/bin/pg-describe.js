#!/usr/bin/env node
// pnpm won't create bin links if the target file doesn't exist at install
// time. Pointing the bin entry at this thin wrapper (which is always present in
// source) avoids that problem while still delegating to the real built CLI.
import '../dist/bin/pg-describe.js';
