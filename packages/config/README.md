# `@prairielearn/config`

Utilities to help load configuration from various sources including a JSON file and AWS Secrets Manager. Config is made type-safe through a [Zod](https://github.com/colinhacks/zod) schema.

This package *should not* be depended upon by other packages directly. Instead, import it into your application, load the config, and then provide any necessary values to other packages.

## Usage

```ts
import { ConfigLoader } from '@prairielearn/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  hello: z.string(),
});

const defaultConfig = {
  hello: 'world',
};

const configLoader = new ConfigLoader({
  defaults: defaultConfig,
  schema: ConfigSchema
});

await configLoader.loadAndValidate('config.json');

console.log(configLoader.config);
// { hello: "world" }
```

Typically, you'll want to have a `config.ts` file in your own project that encapsulates this. Then, you can import the config elsewhere in the project.

```ts
import { ConfigLoader } from '@prairielearn/config'

const configLoader = new ConfigLoader({
  // ...
});

export async function loadAndValidate(filename: string) {
  await configLoader.loadAndValidate();
}

export default configLoader.config;
```
