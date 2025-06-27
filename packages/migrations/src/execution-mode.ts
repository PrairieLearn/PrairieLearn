const IS_VITEST = (import.meta as any).env && (import.meta as any).env.MODE !== 'development';
const IS_VITE = (import.meta as any).env?.MODE === 'development';
export const DEV_EXECUTION_MODE = IS_VITEST ? 'test' : IS_VITE ? 'hmr' : 'dev';
