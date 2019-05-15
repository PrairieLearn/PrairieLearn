const assert = require('chai').assert;
const path = require('path');
const jsonLoad = require('../lib/json-load');

const testfile = filename => path.join(__dirname, 'testJsonLoad', filename);

describe.only('JSON loading', () => {
    describe('readJSON', () => {
        it('reads a JSON file', (done) => {
            jsonLoad.readJSON(testfile('basic.json'), (err, json) => {
                assert.isNull(err);
                const expected = {
                    hello: 'world',
                    testing: 1,
                };
                assert.deepEqual(json, expected);
                done();
            });
        });

        it('errors on a JSON file that doesn\'t exist', (done) => {
            jsonLoad.readJSON(testfile('donotexist.json'), (err, json) => {
                assert.isNotNull(err);
                assert.isUndefined(json);
                done();
            });
        });

        it('errors on a malformed JSON file', (done) => {
            jsonLoad.readJSON(testfile('broken.json'), (err, json) => {
                assert.isNotNull(err);
                assert.isUndefined(json);
                done();
            });
        });
    });

    describe('validateJSON', () => {
        const schema = {
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            additionalProperties: false,
            properties: {
                foo: {
                    type: 'string',
                },
            },
        };

        it('validates JSON that matches a schema', (done) => {
            const valid = {
                'foo': 'bar',
            };
            jsonLoad.validateJSON(valid, schema, (err, json) => {
                assert.isNull(err);
                assert.equal(json, valid);
                done();
            });
        });

        it('rejects JSON that does\'t match a schema', (done) => {
            const invalid = {
                'foo': 1,
            };
            jsonLoad.validateJSON(invalid, schema, (err, json) => {
                assert.isNotNull(err);
                assert.isUndefined(json);
                done();
            });
        });
    });
});
