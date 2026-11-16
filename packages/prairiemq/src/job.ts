import type { JobOptions } from './types.js';

type JobRecord = Record<string, string | undefined>;

function requiredField(record: JobRecord, field: string): string {
  const value = record[field];
  if (value == null) {
    throw new Error(`Job record is missing required field "${field}"`);
  }
  return value;
}

function numericField(record: JobRecord, field: string): number {
  const rawValue = requiredField(record, field);
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Job record has invalid numeric field "${field}": ${rawValue}`);
  }
  return value;
}

interface JobFields<Data, Result> {
  id: string;
  name: string;
  data: Data;
  options: JobOptions;
  groupId?: string | null;
  failedAttempts?: number;
  /** JSON-serializable processor result, or null before completion or without a result. */
  returnvalue?: Result | null;
}

export interface Job<Data = unknown, Result = unknown> {
  readonly id: string;
  readonly name: string;
  readonly data: Data;
  readonly options: JobOptions;
  readonly groupId: string | null;
  /** Number of processor failures, excluding stalled recovery and successful completion. */
  readonly failedAttempts: number;
  /** JSON-serializable processor result, or null before completion or without a result. */
  readonly returnvalue: Result | null;
  readonly attempts: number;
}

class PrairieJob<Data, Result> implements Job<Data, Result> {
  readonly id: string;
  readonly name: string;
  readonly data: Data;
  readonly options: JobOptions;
  readonly groupId: string | null;
  /** Number of processor failures, excluding stalled recovery and successful completion. */
  readonly failedAttempts: number;
  /** JSON-serializable processor result, or null before completion or without a result. */
  readonly returnvalue: Result | null;

  constructor(fields: JobFields<Data, Result>) {
    this.id = fields.id;
    this.name = fields.name;
    this.data = fields.data;
    this.groupId = fields.groupId ?? null;
    this.failedAttempts = fields.failedAttempts ?? 0;
    this.returnvalue = fields.returnvalue ?? null;
    this.options = fields.options;
  }

  /** The number of processor executions allowed after reported processor failures. */
  get attempts(): number {
    return this.options.attempts ?? 1;
  }
}

export function jobFromRecord<Data, Result>(record: JobRecord): Job<Data, Result> {
  return new PrairieJob<Data, Result>({
    id: requiredField(record, 'id'),
    name: requiredField(record, 'name'),
    data: JSON.parse(requiredField(record, 'data')) as Data,
    options: JSON.parse(requiredField(record, 'opts')) as JobOptions,
    groupId: requiredField(record, 'groupId') || null,
    failedAttempts: numericField(record, 'failedAttempts'),
    returnvalue: record.returnvalue != null ? (JSON.parse(record.returnvalue) as Result) : null,
  });
}

export function createJob<Data, Result>(fields: JobFields<Data, Result>): Job<Data, Result> {
  return new PrairieJob(fields);
}
