# `@prairielearn/config`

Utilities to help load configuration from various sources including a JSON file and AWS Secrets Manager. Config is made type-safe through a [Zod](https://github.com/colinhacks/zod) schema.

This package _should not_ be depended upon by other packages directly. Instead, import it into your application, load the config, and then provide any necessary values to other packages.

## Usage

```ts
import { ConfigLoader, makeFileConfig } from '@prairielearn/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  hello: z.string().default('world'),
});

const configLoader = new ConfigLoader(ConfigSchema);

await configLoader.loadAndValidate([makeFileConfig('config.json')]);

console.log(configLoader.config);
// { hello: "world" }
```

Typically, you'll want to have a `config.ts` file in your own project that encapsulates this. Then, you can import the config elsewhere in the project.

```ts
import { ConfigLoader, makeFileConfig } from '@prairielearn/config';
import { z } from 'zod';

const configLoader = new ConfigLoader(z.any());

export async function loadAndValidate(path: string) {
  await configLoader.loadAndValidate([makeFileConfig(path)]);
}

export default configLoader.config;
```

### Loading config from AWS

If you're running in AWS, you can use `makeImdsConfig()` and `makeSecretsManagerConfig()` to load config from IMDS and Secrets Manager, respectively:

- `makeImdsConfig()` will load `hostname`, `instanceId`, and `region`, which will be available if you config schema contains these values.
- `makeSecretsManagerConfig()` will look for a `ConfSecret` tag on the instance. If found, the value of that tag will be used treated as a Secrets Manager secret ID, and that secret's value will be parsed as JSON and merged into the config.

Note that both of these config sources are no-ops by default. To active them, you must do one of the following:

- Set `CONFIG_LOAD_FROM_AWS=1` in the process environment.
- Chain them after `makeFileConfig()`, and ensure that the config file contains `{"runningInEc2": true}`.
