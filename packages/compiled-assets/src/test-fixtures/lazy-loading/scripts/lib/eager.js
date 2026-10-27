import { base } from './base.js';

export const eager = `eager:${base}`;
export const loadNested = () => import('./nested.js');
