import { z } from 'zod';
import fs from 'fs-extra';

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
    let config = { ...this.options.defaults };
    if (filename) {
      const configFromFile = await this.loadConfigFromFile(filename);
      config = { ...config, ...configFromFile };
    }

    this.resolvedConfig = this.options.schema.parse(config);
  }

  private async loadConfigFromFile(filename: string): Promise<Record<string, any>> {
    if (!fs.pathExists(filename)) return {};
    const config = fs.readJson(filename);
    return z.record(z.string(), z.any()).parse(config);
  }

  get config() {
    return this.resolvedConfig;
  }
}
