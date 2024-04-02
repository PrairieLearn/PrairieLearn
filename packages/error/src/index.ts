import _ from 'lodash';
import { HtmlSafeString } from '@prairielearn/html';

interface ErrorWithData extends Error {
  data: any;
}

interface ErrorWithInfo extends Error {
  info: string;
}

interface ErrorWithStatus extends Error {
  status: number;
}

interface ErrorWithStatusAndData extends ErrorWithData, ErrorWithStatus {}

// TODO: rename all functions include "error" in the name so that they can
// be more easily imported as named imports.

export function make(status: number, message: string): ErrorWithStatus;
export function make(status: number, message: string, data: any): ErrorWithStatusAndData;
export function make(status: number, message: string, data?: any): ErrorWithStatusAndData {
  const err = new Error(message) as ErrorWithStatusAndData;
  err.status = status;
  if (data) err.data = data;
  return err;
}

export function makeWithData(message: string, data: any): ErrorWithData {
  const err = new Error(message) as ErrorWithData;
  err.data = data;
  return err;
}

export function makeWithInfo(message: string, info: string): ErrorWithInfo {
  const err = new Error(message) as ErrorWithInfo;
  err.info = info;
  return err;
}

export function addData(err: any, data: any): ErrorWithData {
  const newErr: ErrorWithData = _(err).isError() ? err : new Error(String(err));
  newErr.data = newErr.data || {};
  _.assign(newErr.data, data);
  return newErr;
}

export function newMessage(err: any, newMsg: string): ErrorWithData {
  const newErr: ErrorWithData = _(err).isError() ? err : new Error(String(err));
  newErr.data = newErr.data || {};
  newErr.data._previousMessages = newErr.data._previousMessages || [];
  newErr.data._previousMessages.splice(0, 0, newErr.message);
  newErr.message = `${newMsg}: ${newErr.message}`;
  return newErr;
}

/**
 * Create a new error based an existing one, optionally adding status, message,
 * and/or data. The existing error will be set as the `cause` of the new error.
 *
 * @param err An existing error.
 * @param param.status Status code to set on the new error.
 * @param param.message Message to add to the new error.
 * @param param.data Data to set on the new error.
 * @returns The augmented error.
 */
export function augmentError(
  err: any,
  { status, message, data }: { status?: number; message?: string; data?: any },
): ErrorWithStatusAndData {
  let newErr: ErrorWithStatusAndData;
  if (err instanceof Error) {
    const combinedMessage = message ? `${message}: ${err.message}` : err.message;
    newErr = new Error(combinedMessage, { cause: err }) as ErrorWithStatusAndData;
  } else {
    newErr = new Error(message ?? String(err)) as ErrorWithStatusAndData;
  }
  newErr.status = status ?? 500;
  newErr.data = data;
  return newErr;
}

export interface AugmentedErrorOptions {
  status?: number;
  data?: any;
  info?: HtmlSafeString;
  cause?: unknown;
}

export class AugmentedError extends Error {
  status: number;
  data?: any;
  info?: string;

  constructor(message: string, options: AugmentedErrorOptions) {
    super(message, { cause: options.cause });
    this.status = options.status ?? 500;
    this.data = options.data;
    this.info = options.info?.toString();
  }
}

export class HttpStatusError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
