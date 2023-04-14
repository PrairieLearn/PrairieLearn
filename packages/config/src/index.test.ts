import { assert } from 'chai';
import { writeFile } from 'node:fs/promises';
import { withFile } from 'tmp-promise';
import { z } from 'zod';

import { ConfigLoader } from './index';

describe('config', () => {
  it('loads config with defaults', async () => {
    const schema = z.object({
      foo: z.string().nullable().default(null),
      bar: z.string().default('baz'),
    });
    const loader = new ConfigLoader(schema);
    await loader.loadAndValidate();
    assert.equal(loader.config.foo, null);
    assert.equal(loader.config.bar, 'baz');
  });

  it('loads config from a file', async () => {
    const schema = z.object({
      foo: z.string().nullable(),
      bar: z.string().default('baz'),
      baz: z.string().default('qux'),
    });
    const loader = new ConfigLoader(schema);
    await withFile(async ({ path }) => {
      await writeFile(path, JSON.stringify({ foo: 'bar', bar: 'bar' }));
      await loader.loadAndValidate(path);
    });
    assert.equal(loader.config.foo, 'bar');
    assert.equal(loader.config.bar, 'bar');
    assert.equal(loader.config.baz, 'qux');
  });

  it('maintains object identity when loading config', async () => {
    const schema = z.object({
      foo: z.string().nullable().default(null),
      bar: z.string().default('baz'),
    });
    const loader = new ConfigLoader(schema);
    const config = loader.config;
    await loader.loadAndValidate();
    assert.strictEqual(config, loader.config);
  });
});
