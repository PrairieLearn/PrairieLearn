import type { JobOptions } from './types.js';

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

  /** The total number of attempts this job is allowed. */
  get attempts(): number {
    return this.opts.attempts ?? 1;
  }

  static fromRecord<Data, Result>(record: Record<string, string>): Job<Data, Result> {
    return new Job<Data, Result>({
      id: record.id ?? '',
      name: record.name ?? '',
      data: JSON.parse(record.data ?? 'null') as Data,
      opts: JSON.parse(record.opts ?? '{}') as JobOptions,
      timestamp: Number(record.timestamp ?? '0'),
      groupId: record.groupId || null,
      attemptsMade: Number(record.attemptsMade ?? '0'),
      stalledCount: Number(record.stalledCount ?? '0'),
      processedOn: record.processedOn != null ? Number(record.processedOn) : null,
      finishedOn: record.finishedOn != null ? Number(record.finishedOn) : null,
      returnvalue: record.returnvalue != null ? (JSON.parse(record.returnvalue) as Result) : null,
      failedReason: record.failedReason ?? null,
    });
  }
}
