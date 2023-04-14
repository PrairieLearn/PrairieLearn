import { assert } from 'chai';
import { writeFile } from 'node:fs/promises';
import { withFile } from 'tmp-promise';
import { z } from 'zod';

import { ConfigLoader } from './index';

async function withEnv(key: string, value: string, fn: () => Promise<void>) {
  const originalValue = process.env[key];
  process.env[key] = value;
  try {
    await fn();
  } finally {
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
}

describe('config', () => {
  it('loads config with defaults', async () => {
    const schema = z.object({
      foo: z.string().nullable().default(null),
      bar: z.string().default('bar'),
    });
    const loader = new ConfigLoader(schema);

    await loader.loadAndValidate();

    assert.equal(loader.config.foo, null);
    assert.equal(loader.config.bar, 'bar');
  });

  it('loads config from a file', async () => {
    const schema = z.object({
      foo: z.string().optional().nullable(),
      bar: z.string().default('bar'),
      baz: z.string().default('baz'),
    });
    const loader = new ConfigLoader(schema);

    await withFile(async ({ path }) => {
      await writeFile(path, JSON.stringify({ foo: 'bar', bar: 'bar' }));
      await loader.loadAndValidate(path);
    });

    assert.equal(loader.config.foo, 'bar');
    assert.equal(loader.config.bar, 'bar');
    assert.equal(loader.config.baz, 'baz');
  });

  it('overrides deep objects', async () => {
    const schema = z.object({
      features: z.record(z.string(), z.boolean()).default({
        foo: true,
        bar: false,
      }),
    });
    const loader = new ConfigLoader(schema);

    await withFile(async ({ path }) => {
      await writeFile(
        path,
        JSON.stringify({
          features: {
            foo: false,
            baz: true,
          },
        })
      );
      await loader.loadAndValidate(path);
    });

    assert.equal(loader.config.features.foo, false);
    assert.equal(loader.config.features.bar, false);
    assert.equal(loader.config.features.baz, true);
  });

  it('loads config from AWS', async () => {
    await withEnv('CONFIG_LOAD_FROM_AWS', 'true', async () => {
      const schema = z.object({
        foo: z.string().default('foo'),
        bar: z.string().default('bar'),
        hostname: z.string().default('localhost'),
      });
      const loader = new ConfigLoader(schema);

      // @ts-expect-error -- Monkey-patching.
      loader.loadConfigFromSecretsManager = async () => ({ bar: 'foo' });
      // @ts-expect-error -- Monkey-patching.
      loader.loadConfigFromImds = async () => ({ hostname: 'foo.bar.baz' });

      await loader.loadAndValidate();
      assert.equal(loader.config.foo, 'foo');
      assert.equal(loader.config.bar, 'foo');
      assert.equal(loader.config.hostname, 'foo.bar.baz');
    });
  });

  it('maintains object identity when loading config', async () => {
    const schema = z.object({});
    const loader = new ConfigLoader(schema);
    const config = loader.config;

    await loader.loadAndValidate();

    assert.strictEqual(config, loader.config);
  });
});
