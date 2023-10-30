import _ from 'lodash';
import fs from 'fs-extra';
import { z } from 'zod';
import { EC2Client, DescribeTagsCommand } from '@aws-sdk/client-ec2';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { fetchInstanceHostname, fetchInstanceIdentity } from '@prairielearn/aws-imds';

const AbstractConfigSchema = z.record(z.string(), z.unknown());
type AbstractConfig = z.infer<typeof AbstractConfigSchema>;

interface ConfigSource {
  load: (existingConfig: AbstractConfig) => Promise<AbstractConfig>;
}

export function makeLiteralConfigSource(config: AbstractConfig) {
  return {
    load: async () => config,
  };
}

export function makeFileConfigSource(path: string): ConfigSource {
  return {
    load: async () => {
      if (!(await fs.pathExists(path))) return {};

      const config = await fs.readJson(path);
      return z.record(z.string(), z.any()).parse(config);
    },
  };
}

export function makeSecretsManagerConfigSource(tagKey: string): ConfigSource {
  return {
    load: async (existingConfig) => {
      if (!existingConfig.runningInEc2 && !process.env.CONFIG_LOAD_FROM_AWS) {
        return {};
      }

      const identity = await fetchInstanceIdentity();

      // We disable the ESLint rule here because we don't care about sharing
      // configs between clients in this case. We only want to share configs
      // to avoid spamming the IMDS API when creating lots of clients, but
      // this client will only be used once, typically at application startup.
      // eslint-disable-next-line @prairielearn/aws-client-shared-config
      const ec2Client = new EC2Client({ region: identity.region });
      const tags = await ec2Client.send(
        new DescribeTagsCommand({
          Filters: [{ Name: 'resource-id', Values: [identity.instanceId] }],
        }),
      );

      const secretId = tags.Tags?.find((tag) => tag.Key === tagKey)?.Value;
      if (!secretId) return {};

      // As above, we don't care about sharing configs between clients.
      // eslint-disable-next-line @prairielearn/aws-client-shared-config
      const secretsManagerClient = new SecretsManagerClient({ region: identity.region });
      const secretValue = await secretsManagerClient.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );
      if (!secretValue.SecretString) return {};

      const config = JSON.parse(secretValue.SecretString);
      return z.record(z.string(), z.any()).parse(config);
    },
  };
}

export function makeImdsConfigSource(): ConfigSource {
  return {
    load: async (existingConfig) => {
      if (!existingConfig.runningInEc2 && !process.env.CONFIG_LOAD_FROM_AWS) {
        return {};
      }

      const hostname = await fetchInstanceHostname();
      const identity = await fetchInstanceIdentity();

      return {
        hostname,
        instanceId: identity.instanceId,
        awsRegion: identity.region,
      };
    },
  };
}

export class ConfigLoader<Schema extends z.ZodTypeAny> {
  private readonly schema: Schema;
  private readonly resolvedConfig: z.infer<Schema>;

  constructor(schema: Schema) {
    this.schema = schema;

    // Get the default values from the schema. This ensures that all values
    // have defaults, and also allows us to override nested defaults with
    // `_.merge()` in `loadAndValidate()`.
    this.resolvedConfig = schema.parse({});
  }

  async loadAndValidate(sources: ConfigSource[] = []) {
    let config = this.schema.parse({});
    // If the config setting is an array, override instead of merge
    const mergeRule = (_obj: any, src: any) => (Array.isArray(src) ? src : undefined);

    for (const source of sources) {
      config = _.mergeWith(config, await source.load(config), mergeRule);
    }

    const parsedConfig = this.schema.parse(config);
    _.mergeWith(this.resolvedConfig, parsedConfig, mergeRule);
  }

  get config() {
    return this.resolvedConfig;
  }
}
