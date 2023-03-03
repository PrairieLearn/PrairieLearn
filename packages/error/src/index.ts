import _ from 'lodash';

// TODO: rename all functions include "error" in the name so that they can
// be more easily imported as named imports.

export function make(status: number, message: string, data: any) {
  const err = new Error(message);
  (err as any).status = status;
  (err as any).data = data;
  return err;
}

export function makeWithData(message: string, data: any) {
  const err = new Error(message);
  (err as any).data = data;
  return err;
}

export function addData(err: any, data: any) {
  const newErr = _(err).isError() ? err : new Error(String(err));
  newErr.data = newErr.data || {};
  _.assign(newErr.data, data);
  return newErr;
}

export function newMessage(err: any, newMsg: string) {
  const newErr = _(err).isError() ? err : new Error(String(err));
  newErr.data = newErr.data || {};
  newErr.data._previousMessages = newErr.data._previousMessages || [];
  newErr.data._previousMessages.splice(0, 0, newErr.message);
  newErr.message = `${newMsg}: ${newErr.message}`;
  return newErr;
}
