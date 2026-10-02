import fs from 'node:fs';
import { createRequire } from 'node:module';

import {
  SPREADSHEET_ENGINE_WASM_PATH,
  initializeSpreadsheetEngine,
  isSpreadsheetEngineInitialized,
  spreadsheetEngineImports,
} from './spreadsheet-engine.js';

const require = createRequire(import.meta.url);

/** Loads the spreadsheet engine on the server. Compiling it takes a moment, so it is done once, lazily. */
export function loadSpreadsheetEngine(): void {
  if (isSpreadsheetEngineInitialized()) return;
  const wasm = fs.readFileSync(require.resolve(SPREADSHEET_ENGINE_WASM_PATH));
  const instance = new WebAssembly.Instance(
    new WebAssembly.Module(wasm),
    spreadsheetEngineImports(),
  );
  initializeSpreadsheetEngine(instance);
}
