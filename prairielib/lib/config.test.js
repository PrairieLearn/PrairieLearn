// @ts-check
const { assert } = require('chai');
const path = require('path');
const util = require('util');
const { loadConfigForEnvironment } = require('./config');

describe('config', () => {
  const configDir = path.resolve(__dirname, '..', 'fixtures', 'config');

  it('loads defaults from config', async () => {
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'testbase');
    assert.equal(config.testBoolean, true);
    assert.equal(config.testNumber, 123);
    assert.equal(config.testString, 'hello');
  });

  it('overrides boolean from environment variable', async () => {
    process.env['TEST_BOOLEAN'] = 'false';
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'testbase');
    assert.equal(config.testBoolean, false);
    delete process.env['TEST_BOOLEAN'];
  });

  it('overrides number from environment variable', async () => {
    process.env['TEST_NUMBER'] = '321';
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'testbase');
    assert.equal(config.testNumber, 321);
    delete process.env['TEST_NUMBER'];
  });

  it('overrides string from environment variable', async () => {
    process.env['TEST_STRING'] = 'olleh';
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'testbase');
    assert.equal(config.testString, 'olleh');
    delete process.env['TEST_STRING'];
  });

  it('inheritance: loads from config with a parent', async () => {
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'test');
    assert.equal(config.testBoolean, false);
    assert.equal(config.testNumber, 456);
    assert.equal(config.testString, 'goodbye');
  });

  it('inheritance: overrides boolean from environment variable (true)', async () => {
    process.env['TEST_BOOLEAN'] = 'true';
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'test');
    assert.equal(config.testBoolean, true);
    delete process.env['TEST_BOOLEAN'];
  });

  it('inheritance: overrides boolean from environment variable (false)', async () => {
    process.env['TEST_BOOLEAN'] = 'false';
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'test');
    assert.equal(config.testBoolean, false);
    delete process.env['TEST_BOOLEAN'];
  });

  it('inheritance: overrides number from environment variable', async () => {
    process.env['TEST_NUMBER'] = '321';
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'test');
    assert.equal(config.testNumber, 321);
    delete process.env['TEST_NUMBER'];
  });

  it('inheritance: overrides string from environment variable', async () => {
    process.env['TEST_STRING'] = 'olleh';
    const config = await util.promisify(loadConfigForEnvironment)(configDir, 'test');
    assert.equal(config.testString, 'olleh');
    delete process.env['TEST_STRING'];
  });
});
