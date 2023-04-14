const { assert } = require('chai');
const _ = require('lodash');

const oldConfig = require('../lib/config');
const { config: newConfig } = require('../lib/config-new');

describe('config', () => {
  it('has same keys and default values in old and new configs', () => {
    const adjustedOldConfig = _.omit(oldConfig, [
      'getDBConfigValue',
      'getDBConfigValueAsync',
      'loadConfig',
      'loadConfigAsync',
      'removeDBConfigValue',
      'removeDBConfigValueAsync',
      'setDBConfigValue',
      'setDBConfigValueAsync',
      'setLocals',
    ]);

    // `mocha-hooks.mjs` overrides these two values. Restore them to their
    // defaults so that we can properly test things.
    adjustedOldConfig.workersCount = null;
    adjustedOldConfig.fileEditorUseGit = false;

    assert.deepEqual(adjustedOldConfig, newConfig);
  });
});
