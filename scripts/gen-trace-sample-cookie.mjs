#!/usr/bin/env node
// @ts-check
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { generateSignedToken } from '@prairielearn/signed-token';

const DEFAULT_SECRET_KEY = 'THIS_IS_THE_SECRET_KEY';

// Parse command-line arguments
const { values, positionals } = parseArgs({
  options: {
    config: {
      type: 'string',
    },
    help: {
      type: 'boolean',
      short: 'h',
    },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`
Usage: gen-trace-sample-cookie.mjs <expiration> [--config <path>]

Arguments:
  <expiration>      Expiration date/time in ISO format (e.g., 2025-12-31T23:59:59Z)
                    or a relative time string (e.g., "7 days", "1 hour")

Options:
  --config <path>   Path to JSON config file with a 'secretKey' property
  -h, --help        Show this help message

If --config is not specified, the default secret key will be used.
`);
  process.exit(values.help ? 0 : 1);
}

try {
  // Get expiration from positional argument
  const expirationInput = positionals[0];
  console.log(`📅 Parsing expiration: ${expirationInput}`);

  // Parse the expiration date and convert to Unix timestamp
  let expirationDate;
  try {
    expirationDate = new Date(expirationInput);
    if (Number.isNaN(expirationDate.getTime())) {
      throw new Error('Invalid date');
    }
  } catch {
    console.error(
      '❌ Error: Invalid date format. Please use ISO format (e.g., 2025-12-31T23:59:59Z)',
    );
    throw new Error('Invalid date format');
  }

  const exp = Math.floor(expirationDate.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);

  if (exp <= now) {
    console.error('❌ Error: Expiration date must be in the future');
    throw new Error('Expiration date must be in the future');
  }

  console.log(`✅ Expiration set to: ${expirationDate.toISOString()}`);
  console.log(`⏱️  Time until expiration: ${Math.floor((exp - now) / 60)} minutes`);

  // Get secret key from config or use default
  let secretKey = DEFAULT_SECRET_KEY;

  if (values.config) {
    console.log(`🔑 Loading secret key from config file: ${values.config}`);
    try {
      const configContent = await readFile(values.config, 'utf-8');
      const config = JSON.parse(configContent);

      if (!config.secretKey) {
        console.error('❌ Error: Config file does not contain a "secretKey" property');
        throw new Error('Missing secretKey in config');
      }

      secretKey = config.secretKey;
      console.log('✅ Secret key loaded from config file');
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        console.error(`❌ Error: Config file not found: ${values.config}`);
      } else if (err instanceof SyntaxError) {
        console.error('❌ Error: Config file is not valid JSON');
      }
      throw err;
    }
  } else {
    console.log(`🔑 Using default secret key: ${DEFAULT_SECRET_KEY}`);
  }

  // Generate the signed token
  console.log('🔐 Generating signed token...');
  const token = generateSignedToken({ exp }, secretKey);

  // Output the JavaScript code to set the cookie
  console.log('\n=== Copy and paste the following JavaScript into your browser console ===\n');
  console.log(
    `document.cookie = "prairielearn_trace_sample=${token}; path=/; max-age=${exp - now}";`,
  );
  console.log('\n=== Cookie Configuration ===');
  console.log(`Token: ${token}`);
  console.log(`Expires: ${expirationDate.toISOString()}`);
  console.log(`Unix timestamp: ${exp}`);
  console.log(`Max-age: ${exp - now} seconds`);
} catch (err) {
  console.error('❌ Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
