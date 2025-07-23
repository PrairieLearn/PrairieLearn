// We don't compare against 'test' since we use the 'MODE' environment variable
// for running a subset of our tests.
const IS_VITEST = (import.meta as any).env && (import.meta as any).env.MODE !== 'development';
// ssr.external must be false for this to work correctly.
const IS_VITE = (import.meta as any).env?.MODE === 'development';
export const DEV_EXECUTION_MODE = IS_VITEST ? 'test' : IS_VITE ? 'hmr' : 'dev';
