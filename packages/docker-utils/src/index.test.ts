import { assert } from 'chai';

import { DockerName } from './index';

describe('DockerName', () => {
  it('parses a simple repository', () => {
    const name = new DockerName('node:latest');
    assert.equal(name.getRepository(), 'node');
    assert.equal(name.getTag(), 'latest');
    assert.equal(name.getRegistryRepo(), 'node');
    assert.equal(name.getCombined(), 'node:latest');
  });

  it('parses a scoped repository', () => {
    const name = new DockerName('prairielearn/prairielearn:latest');
    assert.equal(name.getRepository(), 'prairielearn/prairielearn');
    assert.equal(name.getTag(), 'latest');
    assert.equal(name.getRegistryRepo(), 'prairielearn/prairielearn');
    assert.equal(name.getCombined(), 'prairielearn/prairielearn:latest');
  });

  it('parses a repository with a registry', () => {
    const name = new DockerName('ghcr.io/prairielearn/prairielearn:latest');
    assert.equal(name.getRepository(), 'prairielearn/prairielearn');
    assert.equal(name.getTag(), 'latest');
    assert.equal(name.getRegistryRepo(), 'ghcr.io/prairielearn/prairielearn');
    assert.equal(name.getCombined(), 'ghcr.io/prairielearn/prairielearn:latest');
  });

  it('serializes after setting a new registry', () => {
    const name = new DockerName('prairielearn/prairielearn:latest');
    name.setRegistry('ghcr.io');
    assert.equal(name.getCombined(), 'ghcr.io/prairielearn/prairielearn:latest');
    name.setRegistry(undefined);
    assert.equal(name.getCombined(), 'prairielearn/prairielearn:latest');
  });
});
