# `@prairielearn/config`

Utilities to help load configuration from various sources including a JSON file and AWS Secrets Manager. Config is made type-safe through a [Zod](https://github.com/colinhacks/zod) schema.

This package *should not* be depended upon by other packages directly. Instead, import it into your application, load the config, and then provide any necessary values to other packages.

## Usage

```ts
import { ConfigLoader } from '@prairielearn/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  hello: z.string().default('world'),
});

const configLoader = new ConfigLoader(ConfigSchema);

await configLoader.loadAndValidate('config.json');

console.log(configLoader.config);
// { hello: "world" }
```

Typically, you'll want to have a `config.ts` file in your own project that encapsulates this. Then, you can import the config elsewhere in the project.

```ts
import { ConfigLoader } from '@prairielearn/config'
import { z } from 'zod';

const configLoader = new ConfigLoader(z.any());

export async function loadAndValidate(filename: string) {
  await configLoader.loadAndValidate();
}

export default configLoader.config;
```

### Loading config from AWS

If your application is running in AWS, you can opt in to loading certain pieces of config from AWS services in one of two ways:

- Set `CONFIG_LOAD_FROM_AWS=1` in the process environment
- Place `{"runningInEc2": true}` in the config file whose path is passed to `loadAndValidate()`.

The following will then be used to load config.

- If your schema contains the keys `hostname`, `instanceId`, and `region`, those values will automatically be fetched from IMDS and made available on the resulting config.
- If the EC2 instance has a `ConfSecret` tag, the value of that tag will be used treated as a Secrets Manager secret ID, and that secret's value will be parsed as JSON and merged into the config.
