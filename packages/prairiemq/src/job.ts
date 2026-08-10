import type { JobOptions } from './types.js';

function requiredField(record: Record<string, string>, field: string): string {
  const value = record[field];
  if (value == null) {
    throw new Error(`Job record is missing required field "${field}"`);
  }
  return value;
}

function numericField(record: Record<string, string>, field: string): number {
  const rawValue = requiredField(record, field);
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Job record has invalid numeric field "${field}": ${rawValue}`);
  }
  return value;
}

function optionalNumericField(record: Record<string, string>, field: string): number | null {
  return record[field] == null ? null : numericField(record, field);
}

interface JobFields<Data, Result> {
  id: string;
  name: string;
  data: Data;
  opts: JobOptions;
  timestamp: number;
  groupId: string | null;
  attemptsMade: number;
  stalledCount: number;
  processedOn: number | null;
  finishedOn: number | null;
  returnvalue: Result | null;
  failedReason: string | null;
}

export class Job<Data = unknown, Result = unknown> {
  readonly id: string;
  readonly name: string;
  readonly data: Data;
  readonly opts: JobOptions;
  /** When the job was added, in milliseconds since the epoch. */
  readonly timestamp: number;
  readonly groupId: string | null;
  /** How many times this job has been picked up for processing, including the current attempt. */
  readonly attemptsMade: number;
  readonly stalledCount: number;
  readonly processedOn: number | null;
  readonly finishedOn: number | null;
  readonly returnvalue: Result | null;
  readonly failedReason: string | null;

  constructor(fields: JobFields<Data, Result>) {
    this.id = fields.id;
    this.name = fields.name;
    this.data = fields.data;
    this.opts = fields.opts;
    this.timestamp = fields.timestamp;
    this.groupId = fields.groupId;
    this.attemptsMade = fields.attemptsMade;
    this.stalledCount = fields.stalledCount;
    this.processedOn = fields.processedOn;
    this.finishedOn = fields.finishedOn;
    this.returnvalue = fields.returnvalue;
    this.failedReason = fields.failedReason;
  }

  /** The number of processor executions allowed after reported processor failures. */
  get attempts(): number {
    return this.opts.attempts ?? 1;
  }

  static fromRecord<Data, Result>(record: Record<string, string>): Job<Data, Result> {
    return new Job<Data, Result>({
      id: requiredField(record, 'id'),
      name: requiredField(record, 'name'),
      data: JSON.parse(requiredField(record, 'data')) as Data,
      opts: JSON.parse(requiredField(record, 'opts')) as JobOptions,
      timestamp: numericField(record, 'timestamp'),
      groupId: requiredField(record, 'groupId') || null,
      attemptsMade: numericField(record, 'attemptsMade'),
      stalledCount: numericField(record, 'stalledCount'),
      processedOn: optionalNumericField(record, 'processedOn'),
      finishedOn: optionalNumericField(record, 'finishedOn'),
      returnvalue: record.returnvalue != null ? (JSON.parse(record.returnvalue) as Result) : null,
      failedReason: record.failedReason ?? null,
    });
  }
}
