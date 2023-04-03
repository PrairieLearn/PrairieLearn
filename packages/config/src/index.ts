import fs from 'fs-extra';
import { z } from 'zod';
import { EC2Client, DescribeTagsCommand } from '@aws-sdk/client-ec2';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  isImdsAvailable,
  fetchInstanceHostname,
  fetchInstanceIdentity,
} from '@prairielearn/aws-imds';

interface ConfigLoaderOptions<Schema extends z.ZodTypeAny> {
  schema: Schema;
  defaults: z.infer<Schema>;
}

export class ConfigLoader<Schema extends z.ZodTypeAny> {
  private options: ConfigLoaderOptions<Schema>;
  private resolvedConfig: z.infer<Schema>;

  constructor(options: ConfigLoaderOptions<Schema>) {
    this.options = options;
    this.resolvedConfig = options.defaults;
  }

  async loadAndValidate(filename?: string) {
    const configFromFile = await this.loadConfigFromFile(filename);
    const loadConfigFromSecretsManager = await this.loadConfigFromSecretsManager();
    const configFromImds = await this.loadConfigFromImds();

    const config = {
      ...this.options.defaults,
      ...configFromFile,
      ...loadConfigFromSecretsManager,
      // Dynamic values from IMDS will always override any other values.
      ...configFromImds,
    };

    this.resolvedConfig = this.options.schema.parse(config);
  }

  private async loadConfigFromFile(filename: string | undefined): Promise<Record<string, any>> {
    if (!filename || !fs.pathExists(filename)) return {};
    const config = fs.readJson(filename);
    return z.record(z.string(), z.any()).parse(config);
  }

  private async loadConfigFromSecretsManager(): Promise<Record<string, any>> {
    if (!(await isImdsAvailable())) return {};

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
    if (!(await isImdsAvailable())) return {};

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
