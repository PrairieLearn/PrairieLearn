export type AbstractConfig = Record<string, unknown>;

export interface ConfigSource<T extends AbstractConfig = AbstractConfig> {
  load: (existingConfig: T) => Promise<Partial<T>>;
}
