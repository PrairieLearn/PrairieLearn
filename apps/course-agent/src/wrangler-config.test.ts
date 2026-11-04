import { describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';

describe('wrangler.jsonc', () => {
  // Deploys must not reset a Conversation mid-turn or while its user may still return.
  it.each([undefined, 'staging', 'production'])(
    'defers Durable Object code updates past an active conversation in %s',
    (env) => {
      const config = unstable_readConfig({
        config: `${import.meta.dirname}/../wrangler.jsonc`,
        env,
      });
      const vars = config.vars as Record<string, string>;
      expect(config.durable_objects.code_update_strategy?.mode).toBe('deferred');
      expect(config.durable_objects.code_update_strategy?.max_delay).toBeGreaterThanOrEqual(
        Number(vars.AGENT_TURN_SECONDS) + Number(vars.USER_IDLE_SECONDS),
      );
    },
  );
});
