import _ from 'lodash';
import fs from 'fs-extra';
import { z } from 'zod';
import { EC2Client, DescribeTagsCommand } from '@aws-sdk/client-ec2';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { fetchInstanceHostname, fetchInstanceIdentity } from '@prairielearn/aws-imds';

export class ConfigLoader<Schema extends z.ZodTypeAny> {
  private readonly schema: Schema;
  private readonly resolvedConfig: z.infer<Schema>;

  constructor(schema: Schema) {
    this.schema = schema;
    this.resolvedConfig = {};
  }

  async loadAndValidate(filename?: string) {
    // Get the default values from the schema. This ensures that all values
    // have defaults, and also allows us to override nested defaults with
    // `_.merge()`.
    let config = this.schema.parse({});

    const fileConfig = await this.loadConfigFromFile(filename);
    _.merge(config, fileConfig);

    if (config.runningInEc2 || process.env.CONFIG_LOAD_FROM_AWS) {
      const configFromSecretsManager = await this.loadConfigFromSecretsManager();
      const configFromImds = await this.loadConfigFromImds();
      config = _.merge(config, configFromSecretsManager, configFromImds);
    }

    const parsedConfig = this.schema.parse(config);
    _.merge(this.resolvedConfig, parsedConfig);
  }

  private async loadConfigFromFile(filename: string | undefined): Promise<Record<string, any>> {
    if (!filename || !fs.pathExists(filename)) return {};
    const config = await fs.readJson(filename);
    return z.record(z.string(), z.any()).parse(config);
  }

  private async loadConfigFromSecretsManager(): Promise<Record<string, any>> {
    const identity = await fetchInstanceIdentity();

    const ec2Client = new EC2Client({ region: identity.region });
    const tags = await ec2Client.send(
      new DescribeTagsCommand({
        Filters: [{ Name: 'resource-id', Values: [identity.instanceId] }],
      })
    );

    const secretId = tags.Tags?.find((tag) => tag.Key === 'ConfSecret')?.Value;
    if (!secretId) return {};

    const secretsManagerClient = new SecretsManagerClient({ region: identity.region });
    const secretValue = await secretsManagerClient.send(
      new GetSecretValueCommand({ SecretId: secretId })
    );
    if (!secretValue.SecretString) return {};

    return JSON.parse(secretValue.SecretString);
  }

  private async loadConfigFromImds(): Promise<Record<string, any>> {
    const hostname = await fetchInstanceHostname();
    const identity = await fetchInstanceIdentity();

    return {
      hostname,
      instanceId: identity.instanceId,
      region: identity.region,
    };
  }

  get config() {
    return this.resolvedConfig;
  }
}
