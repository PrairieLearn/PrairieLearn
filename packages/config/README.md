# `@prairielearn/config`

Utilities to help load configuration from various sources including a JSON file, AWS Secrets Manager, and AWS KMS encrypted values. Config is made type-safe through a [Zod](https://github.com/colinhacks/zod) schema.

This package _should not_ be depended upon by other packages directly. Instead, import it into your application, load the config, and then provide any necessary values to other packages.

## Usage

```ts
import { ConfigLoader, makeFileConfigSource } from '@prairielearn/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  hello: z.string().default('world'),
});

const configLoader = new ConfigLoader(ConfigSchema);

await configLoader.loadAndValidate([makeFileConfigSource('config.json')]);

console.log(configLoader.config);
// { hello: "world" }
```

Typically, you'll want to have a `config.ts` file in your own project that encapsulates this. Then, you can import the config elsewhere in the project.

```ts
import { ConfigLoader, makeFileConfigSource } from '@prairielearn/config';
import { z } from 'zod';

const configLoader = new ConfigLoader(z.any());

export async function loadAndValidate(path: string) {
  await configLoader.loadAndValidate([makeFileConfigSource(path)]);
}

export default configLoader.config;
```

### Loading config from AWS

If you're running in AWS, you can use `makeImdsConfigSource()`, `makeSecretsManagerConfigSource()`, and `makeKmsConfigSource()` to load config from IMDS, Secrets Manager, and AWS KMS, respectively:

- `makeImdsConfigSource()` will load `hostname`, `instanceId`, and `awsRegion`, which will be available if your config schema contains these values.
- `makeSecretsManagerConfigSource()` will look for a `ConfSecret` tag on the instance. If found, the value of that tag will be used as a Secrets Manager secret ID, and that secret's value will be parsed as JSON and merged into the config.
- `makeKmsConfigSource()` will recursively decrypt encrypted config value objects already loaded into the accumulated config. It is a transforming source, so place it after any source that may introduce encrypted values and before final validation.

```ts
await configLoader.loadAndValidate([
  makeFileConfigSource('config.json'),
  makeImdsConfigSource(),
  makeSecretsManagerConfigSource('ConfSecret'),
  makeKmsConfigSource(),
]);
```

Note that `makeImdsConfigSource()` and `makeSecretsManagerConfigSource()` are no-ops by default. To activate them, you must do one of the following:

- Set `CONFIG_LOAD_FROM_AWS=1` in the process environment.
- Chain them after `makeFileConfigSource()`, and ensure that the config file contains `{"runningInEc2": true}`.

`makeKmsConfigSource()` only creates a KMS client when encrypted config values are present. It resolves its region from `awsRegion` in the accumulated config or from the AWS SDK's default region provider chain.

Encrypted config values use this JSON object shape:

```json
{
  "__encrypted": "aws-kms-v1",
  "ciphertext": "base64-encoded KMS CiphertextBlob",
  "context": {
    "environment": "us-prod"
  },
  "metadata": {
    "key": "alias/service-config/us-prod",
    "description": "prairietest postgresql password"
  }
}
```

The required runtime fields are `__encrypted`, `ciphertext`, and `context`. `ciphertext` is base64-decoded and passed to KMS as the `CiphertextBlob`, and `context` is passed to KMS as the exact encryption context with all values as strings. `metadata` is optional review/debug information; the example above shows recommended fields, but runtime decryption ignores metadata instead of trusting, validating, or passing it to KMS. KMS infers the key from the ciphertext during decrypt. Decrypted plaintext must be valid UTF-8 and is returned as a string.
