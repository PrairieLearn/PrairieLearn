import { DecryptCommand, type DecryptCommandOutput, KMSClient } from '@aws-sdk/client-kms';
import { z } from 'zod';

import type { ConfigSource } from '../types.js';

const MetadataSchema = z
  .object({
    key: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

const EncryptedValueSchema = z.object({
  __encrypted: z.literal('aws-kms-v1'),
  ciphertext: z.string(),
  context: z.record(z.string(), z.string()),
  metadata: MetadataSchema.optional(),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isEncryptedValue(value: unknown): boolean {
  return isPlainObject(value) && Object.hasOwn(value, '__encrypted');
}

function formatConfigPath(path: (string | number)[]): string {
  return path.length === 0
    ? '<root>'
    : path
        .map((part, index) =>
          typeof part === 'number' ? `[${part}]` : index === 0 ? part : `.${part}`,
        )
        .join('');
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<value>'}: ${issue.message}`)
    .join('; ');
}

function parseEncryptedValue(value: unknown, path: (string | number)[]) {
  const result = EncryptedValueSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Malformed encrypted config value at ${formatConfigPath(path)}: ${formatZodIssues(result.error)}`,
    );
  }

  return result.data;
}

function decodeBase64Ciphertext(ciphertext: string, path: (string | number)[]): Buffer {
  if (
    ciphertext.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(ciphertext)
  ) {
    throw new Error(
      `Invalid base64 ciphertext in encrypted config value at ${formatConfigPath(path)}`,
    );
  }

  return Buffer.from(ciphertext, 'base64');
}

async function decryptEncryptedValue(
  value: unknown,
  path: (string | number)[],
  getKmsClient: () => KMSClient,
): Promise<string> {
  const encryptedValue = parseEncryptedValue(value, path);
  const ciphertextBlob = decodeBase64Ciphertext(encryptedValue.ciphertext, path);
  const kmsClient = getKmsClient();

  let result: DecryptCommandOutput;
  try {
    result = await kmsClient.send(
      new DecryptCommand({
        CiphertextBlob: ciphertextBlob,
        EncryptionContext: encryptedValue.context,
      }),
    );
  } catch (error) {
    throw new Error(`KMS decrypt failed for encrypted config value at ${formatConfigPath(path)}`, {
      cause: error,
    });
  }

  if (!result.Plaintext) {
    throw new Error(
      `KMS decrypt result missing Plaintext for encrypted config value at ${formatConfigPath(path)}`,
    );
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(result.Plaintext);
  } catch (error) {
    throw new Error(
      `KMS decrypt result Plaintext is not valid UTF-8 for encrypted config value at ${formatConfigPath(path)}`,
      { cause: error },
    );
  }
}

async function decryptEncryptedValuesInPlace(
  value: unknown,
  path: (string | number)[],
  getKmsClient: () => KMSClient,
): Promise<unknown> {
  if (isEncryptedValue(value)) {
    return await decryptEncryptedValue(value, path, getKmsClient);
  }

  if (Array.isArray(value)) {
    await Promise.all(
      value.map(async (item, index) => {
        value[index] = await decryptEncryptedValuesInPlace(item, [...path, index], getKmsClient);
      }),
    );
    return value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  for (const [key, childValue] of Object.entries(value)) {
    value[key] = await decryptEncryptedValuesInPlace(childValue, [...path, key], getKmsClient);
  }

  return value;
}

export function makeKmsConfigSource(): ConfigSource {
  return {
    load: async (existingConfig) => {
      let kmsClient: KMSClient | undefined;

      // The client is created lazily so this source remains a no-op when there
      // are no encrypted values. If a client is created, it's then reused for
      // all decrypts in this load.
      const getKmsClient = () => {
        if (!kmsClient) {
          const region =
            typeof existingConfig.awsRegion === 'string' ? existingConfig.awsRegion : undefined;

          // We don't care about sharing configs between clients here; this
          // client is only used once, typically at application startup.
          // eslint-disable-next-line @prairielearn/aws-client-shared-config
          kmsClient = new KMSClient({ region });
        }
        return kmsClient;
      };

      const resolvedConfig = structuredClone(existingConfig);
      await decryptEncryptedValuesInPlace(resolvedConfig, [], getKmsClient);
      return resolvedConfig as Partial<typeof existingConfig>;
    },
  };
}
