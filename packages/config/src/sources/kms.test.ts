import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ConfigLoader, makeKmsConfigSource, makeLiteralConfigSource } from '../index.js';

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-kms', () => ({
  DecryptCommand: vi.fn(function DecryptCommand(input: unknown) {
    return { input };
  }),
  KMSClient: vi.fn(function KMSClient() {
    return { send: sendMock };
  }),
}));

function makeEncryptedValue(ciphertext = Buffer.from('ciphertext').toString('base64')) {
  return {
    __encrypted: 'aws-kms-v1',
    ciphertext,
    context: {
      environment: 'us-prod',
    },
    metadata: {
      key: 'alias/service-config/us-prod',
      description: 'prairietest postgresql password',
    },
  };
}

describe('makeKmsConfigSource', () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.mocked(DecryptCommand).mockClear();
    vi.mocked(KMSClient).mockClear();
  });

  it('returns an unchanged config and does not create a KMS client when there are no encrypted values', async () => {
    const source = makeKmsConfigSource();

    assert.deepEqual(await source.load({ secret: 'plaintext' }), { secret: 'plaintext' });
    expect(KMSClient).not.toHaveBeenCalled();
  });

  it('decrypts a top-level encrypted string', async () => {
    sendMock.mockResolvedValue({ Plaintext: new TextEncoder().encode('decrypted') });
    const schema = z.object({
      secret: z.string().default(''),
    });
    const loader = new ConfigLoader(schema);

    await loader.loadAndValidate([
      makeLiteralConfigSource({
        secret: makeEncryptedValue(),
      }),
      makeKmsConfigSource(),
    ]);

    assert.equal(loader.config.secret, 'decrypted');
    expect(DecryptCommand).toHaveBeenCalledWith({
      CiphertextBlob: Buffer.from('ciphertext'),
      EncryptionContext: {
        environment: 'us-prod',
      },
    });
  });

  it('ignores metadata when decrypting', async () => {
    sendMock.mockResolvedValue({ Plaintext: new TextEncoder().encode('decrypted') });

    await makeKmsConfigSource().load({
      secret: {
        ...makeEncryptedValue(),
        metadata: {
          key: 42,
          description: {
            text: 'metadata is not used by runtime decryption',
          },
          owner: ['course-staff'],
        },
      },
    });

    expect(DecryptCommand).toHaveBeenCalledWith({
      CiphertextBlob: Buffer.from('ciphertext'),
      EncryptionContext: {
        environment: 'us-prod',
      },
    });
  });

  it('passes encryption context through to KMS without requiring PrairieLearn-specific keys', async () => {
    sendMock.mockResolvedValue({ Plaintext: new TextEncoder().encode('decrypted') });

    await makeKmsConfigSource().load({
      secret: {
        ...makeEncryptedValue(),
        context: {
          deployment: 'self-hosted',
          purpose: 'config',
        },
      },
    });

    expect(DecryptCommand).toHaveBeenCalledWith({
      CiphertextBlob: Buffer.from('ciphertext'),
      EncryptionContext: {
        deployment: 'self-hosted',
        purpose: 'config',
      },
    });
  });

  it('uses awsRegion from existing config', async () => {
    sendMock.mockResolvedValue({ Plaintext: new TextEncoder().encode('decrypted') });

    await makeKmsConfigSource().load({
      awsRegion: 'us-west-2',
      secret: makeEncryptedValue(),
    });

    expect(KMSClient).toHaveBeenCalledWith({ region: 'us-west-2' });
  });

  it('returns the full transformed config when encrypted values exist', async () => {
    sendMock.mockResolvedValue({ Plaintext: new TextEncoder().encode('decrypted') });

    const result = await makeKmsConfigSource().load({
      database: {
        host: 'db.example.com',
        password: makeEncryptedValue(),
      },
      courseDirs: ['exampleCourse'],
    });

    assert.deepEqual(result, {
      database: {
        host: 'db.example.com',
        password: 'decrypted',
      },
      courseDirs: ['exampleCourse'],
    });
  });

  it('decrypts nested object and array values', async () => {
    sendMock
      .mockResolvedValueOnce({ Plaintext: new TextEncoder().encode('nested') })
      .mockResolvedValueOnce({ Plaintext: new TextEncoder().encode('array') });
    const schema = z.object({
      nested: z
        .object({
          secret: z.string().default(''),
          unchanged: z.string().default('kept'),
        })
        .default({ secret: '', unchanged: 'kept' }),
      values: z.array(z.union([z.string(), z.object({ secret: z.string() })])).default([]),
    });
    const loader = new ConfigLoader(schema);

    await loader.loadAndValidate([
      makeLiteralConfigSource({
        nested: {
          secret: makeEncryptedValue(),
          unchanged: 'kept',
        },
        values: ['first', { secret: makeEncryptedValue() }],
      }),
      makeKmsConfigSource(),
    ]);

    assert.deepEqual(loader.config, {
      nested: {
        secret: 'nested',
        unchanged: 'kept',
      },
      values: ['first', { secret: 'array' }],
    });
    expect(KMSClient).toHaveBeenCalledTimes(1);
  });

  it('does not mutate the source object when decrypting encrypted values', async () => {
    sendMock.mockResolvedValue({ Plaintext: new TextEncoder().encode('decrypted') });
    const encryptedValue = makeEncryptedValue();
    const sourceConfig = {
      secret: encryptedValue,
    };

    const result = await makeKmsConfigSource().load(sourceConfig);

    assert.deepEqual(encryptedValue, makeEncryptedValue());
    assert.deepEqual(sourceConfig, { secret: encryptedValue });
    assert.deepEqual(result, { secret: 'decrypted' });
  });

  it('throws on malformed encrypted values', async () => {
    await expect(
      makeKmsConfigSource().load({
        secret: {
          __encrypted: 'aws-kms-v1',
          ciphertext: Buffer.from('ciphertext').toString('base64'),
        },
      }),
    ).rejects.toThrow(/Malformed encrypted config value.*context/);

    await expect(
      makeKmsConfigSource().load({
        secret: {
          __encrypted: 'aws-kms-v1',
          context: {
            environment: 'us-prod',
          },
        },
      }),
    ).rejects.toThrow(/Malformed encrypted config value.*ciphertext/);

    await expect(
      makeKmsConfigSource().load({
        secret: {
          ...makeEncryptedValue(),
          context: 'us-prod',
        },
      }),
    ).rejects.toThrow(/Malformed encrypted config value.*context/);

    await expect(
      makeKmsConfigSource().load({
        secret: {
          ...makeEncryptedValue(),
          context: {
            environment: 42,
          },
        },
      }),
    ).rejects.toThrow(/Malformed encrypted config value.*context\.environment/);

    await expect(
      makeKmsConfigSource().load({
        secret: {
          __encrypted: 'aws-kms-v2',
          ciphertext: Buffer.from('ciphertext').toString('base64'),
          context: {
            environment: 'us-prod',
          },
        },
      }),
    ).rejects.toThrow(/Malformed encrypted config value.*__encrypted.*aws-kms-v1/);
  });

  it('throws on invalid decrypt results', async () => {
    sendMock.mockResolvedValueOnce({});
    await expect(
      makeKmsConfigSource().load({
        secret: makeEncryptedValue(),
      }),
    ).rejects.toThrow(/missing Plaintext/);

    sendMock.mockResolvedValueOnce({ Plaintext: new Uint8Array([0xff]) });
    await expect(
      makeKmsConfigSource().load({
        secret: makeEncryptedValue(),
      }),
    ).rejects.toThrow(/not valid UTF-8/);
  });

  it('includes the config path when KMS decrypt fails', async () => {
    const cause = new Error('AccessDeniedException');
    sendMock.mockRejectedValue(cause);

    let thrown: unknown;
    try {
      await makeKmsConfigSource().load({
        nested: {
          secret: makeEncryptedValue(),
        },
      });
    } catch (error) {
      thrown = error;
    }

    assert.instanceOf(thrown, Error);
    assert.match(thrown.message, /KMS decrypt failed.*nested\.secret/);
    assert.strictEqual(thrown.cause, cause);
  });
});
