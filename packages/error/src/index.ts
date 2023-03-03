import _ from 'lodash';

interface ErrorWithData extends Error {
  data: any;
}

interface ErrorWithStatus extends ErrorWithData {
  status: number;
}

// TODO: rename all functions include "error" in the name so that they can
// be more easily imported as named imports.

export function make(status: number, message: string, data: any): ErrorWithStatus {
  const err = new Error(message) as ErrorWithStatus;
  err.status = status;
  err.data = data;
  return err;
}

export function makeWithData(message: string, data: any): any {
  const err = new Error(message) as ErrorWithData;
  err.data = data;
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
