import { z } from 'zod';

/** Number of days available for the daily spending chart date range selector. */
export const CHART_DAYS_OPTIONS = [7, 14, 30] as const;
export type ChartDays = (typeof CHART_DAYS_OPTIONS)[number];
export const ChartDaysSchema = z.union([z.literal(7), z.literal(14), z.literal(30)]);

export const DEFAULT_CHART_DAYS: ChartDays = 7;
