import { assert } from 'chai';

import { make, makeWithData, addData, newMessage, makeWithInfo, augmentError } from './index';

describe('make', () => {
  it('makes an error without data', () => {
    const err = make(404, 'Not Found');
    assert.equal(err.status, 404);
    assert.equal(err.message, 'Not Found');
  });

  it('makes an error with data', () => {
    const err = make(404, 'Not Found', { foo: 'bar' });
    assert.equal(err.status, 404);
    assert.equal(err.message, 'Not Found');
    assert.equal(err.data.foo, 'bar');
  });
});

describe('makeWithData', () => {
  it('makes an error with the expected properties', () => {
    const err = makeWithData('Not Found', { foo: 'bar' });
    assert.equal(err.message, 'Not Found');
    assert.equal(err.data.foo, 'bar');
  });
});

describe('makeWithInfo', () => {
  it('makes an error with the expected properties', () => {
    const err = makeWithInfo('Not Found', 'bar');
    assert.equal(err.message, 'Not Found');
    assert.equal(err.info, 'bar');
  });
});

describe('addData', () => {
  it('adds data to an error', () => {
    const err = new Error('Not Found');
    const newErr = addData(err, { foo: 'bar' });

    assert.equal(err.message, 'Not Found');
    assert.equal((err as any).data.foo, 'bar');
    assert.equal(newErr.message, 'Not Found');
    assert.equal(newErr.data.foo, 'bar');
  });

  it('coerces a non-error to a string', () => {
    const newErr = addData('Not Found', { foo: 'bar' });
    assert.equal(newErr.message, 'Not Found');
    assert.equal(newErr.data.foo, 'bar');
  });
});

describe('newMessage', () => {
  it('adds a new message to an error', () => {
    const err = new Error('Not Found');
    const newErr = newMessage(err, '404');

    assert.equal(err.message, '404: Not Found');
    assert.equal((err as any).data._previousMessages[0], 'Not Found');
    assert.equal(newErr.message, '404: Not Found');
    assert.equal(newErr.data._previousMessages[0], 'Not Found');
  });

  it('coerces a non-error to a string', () => {
    const newErr = newMessage('Not Found', '404');
    assert.equal(newErr.message, '404: Not Found');
    assert.equal(newErr.data._previousMessages[0], 'Not Found');
  });
});

describe('augmentError', () => {
  it('adds status, message, and data to an error', () => {
    const err = new Error('Not Found');
    const newErr = augmentError(err, { status: 404, message: 'Missing', data: { foo: 'bar' } });

    assert.equal(newErr.message, 'Missing: Not Found');
    assert.equal(newErr.status, 404);
    assert.equal(newErr.data.foo, 'bar');
    assert.equal(newErr.cause, err);
    assert.equal((newErr.cause as any).message, 'Not Found');
  });
});
