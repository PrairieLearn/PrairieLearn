import { z } from 'zod';

export const CHART_DAYS_OPTIONS = [7, 14, 30] as const;
export type ChartDays = (typeof CHART_DAYS_OPTIONS)[number];
export const ChartDaysSchema = z.union([z.literal(7), z.literal(14), z.literal(30)]);
