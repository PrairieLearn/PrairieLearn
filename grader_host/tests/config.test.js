/* eslint-env jest */
const path = require('path');
const config = require('../lib/config');

describe('config', () => {
    beforeAll(() => {
        config.setConfigDir(path.join(__dirname, 'config'));
    });

    afterAll(() => {
        config.resetConfigDir();
    });

    it('loads defaults from config', (done) => {
        config.loadConfigForEnvironment('testbase', (err, config) => {
            expect(err).toBe(null);
            expect(config.testBoolean).toBe(true);
            expect(config.testNumber).toBe(123);
            expect(config.testString).toBe('hello');
            done();
        });
    });

    it('overrides boolean from environment variable', (done) =>{
        process.env['TEST_BOOLEAN'] = 'false';
        config.loadConfigForEnvironment('testbase', (err, config) => {
            expect(err).toBe(null);
            expect(config.testBoolean).toBe(false);
            delete process.env['TEST_BOOLEAN'];
            done();
        });
    });

    it('overrides number from environment variable', (done) =>{
        process.env['TEST_NUMBER'] = '321';
        config.loadConfigForEnvironment('testbase', (err, config) => {
            expect(err).toBe(null);
            expect(config.testNumber).toBe(321);
            delete process.env['TEST_NUMBER'];
            done();
        });
    });

    it('overrides string from environment variable', (done) =>{
        process.env['TEST_STRING'] = 'olleh';
        config.loadConfigForEnvironment('testbase', (err, config) => {
            expect(err).toBe(null);
            expect(config.testString).toBe('olleh');
            delete process.env['TEST_STRING'];
            done();
        });
    });

    it('inheritance: loads from config with a parent', (done) => {
        config.loadConfigForEnvironment('test', (err, config) => {
            expect(err).toBe(null);
            expect(config.testBoolean).toBe(false);
            expect(config.testNumber).toBe(456);
            expect(config.testString).toBe('goodbye');
            done();
        });
    });

    it('inheritance: overrides boolean from environment variable (true)', (done) =>{
        process.env['TEST_BOOLEAN'] = 'true';
        config.loadConfigForEnvironment('test', (err, config) => {
            expect(err).toBe(null);
            expect(config.testBoolean).toBe(true);
            delete process.env['TEST_BOOLEAN'];
            done();
        });
    });

    it('inheritance: overrides boolean from environment variable (false)', (done) =>{
        process.env['TEST_BOOLEAN'] = 'false';
        config.loadConfigForEnvironment('test', (err, config) => {
            expect(err).toBe(null);
            expect(config.testBoolean).toBe(false);
            delete process.env['TEST_BOOLEAN'];
            done();
        });
    });

    it('inheritance: overrides number from environment variable', (done) =>{
        process.env['TEST_NUMBER'] = '321';
        config.loadConfigForEnvironment('test', (err, config) => {
            expect(err).toBe(null);
            expect(config.testNumber).toBe(321);
            delete process.env['TEST_NUMBER'];
            done();
        });
    });

    it('inheritance: overrides string from environment variable', (done) =>{
        process.env['TEST_STRING'] = 'olleh';
        config.loadConfigForEnvironment('test', (err, config) => {
            expect(err).toBe(null);
            expect(config.testString).toBe('olleh');
            delete process.env['TEST_STRING'];
            done();
        });
    });
});
