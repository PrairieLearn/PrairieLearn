import { assert } from 'chai';
import * as path from 'path';
import * as jsonLoad from '../lib/json-load';

const testfile = (filename: string) => path.join(__dirname, 'testJsonLoad', filename);

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  properties: {
    foo: {
      type: 'string',
    },
  },
};

describe('JSON loading', () => {
  describe('readJSON', () => {
    it('reads a JSON file', async () => {
      const json = await jsonLoad.readJSON(testfile('basic.json'));
      assert.deepEqual(json, {
        hello: 'world',
        testing: 1,
      });
    });

    it("errors on a JSON file that doesn't exist", async () => {
      await assert.isRejected(jsonLoad.readJSON(testfile('donotexist.json')));
    });

    it('errors on a malformed JSON file', async () => {
      await assert.isRejected(jsonLoad.readJSON(testfile('broken.json')));
    });
  });

  describe('validateJSON', () => {
    it('validates JSON that matches a schema', () => {
      jsonLoad.validateJSON({ foo: 'bar' }, schema);
    });

    it("rejects JSON that does't match a schema", () => {
      assert.throws(() => jsonLoad.validateJSON({ foo: 1 }, schema));
    });
  });

  describe('readInfoJson', () => {
    it('reads JSON that matches a schema', async () => {
      const json = await jsonLoad.readInfoJSON(testfile('forSchemaValid.json'), schema);
      assert.deepEqual(json, {
        foo: 'bar',
      });
    });

    it('errors for JSON that does not a schema', async () => {
      await assert.isRejected(jsonLoad.readInfoJSON(testfile('forSchemaInvalid.json'), schema));
    });
  });
});
