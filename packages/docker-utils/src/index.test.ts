import { assert, describe, it } from 'vitest';

import { DockerName } from './index.js';

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

  it.each([
    ['node:24', 'node'],
    ['library/node:24', 'library/node'],
    ['docker.io/node:24', 'docker.io/node'],
    ['docker.io/library/node:24', 'library/node'],
    ['org/image:v1', 'org/image'],
    ['docker.io/org/image:v1', 'org/image'],
    ['index.docker.io/org/image:v1', 'org/image'],
    ['registry-1.docker.io/org/image:v1', 'org/image'],
    ['ghcr.io/org/image:v1', 'ghcr.io/org/image'],
    ['quay.io/org/image:v1', 'quay.io/org/image'],
    ['registry.gitlab.com/group/project/image:v1', 'registry.gitlab.com/group/project/image'],
    ['registry.example.com/image:v1', 'registry.example.com/image'],
  ])('maps %s to its cache repository', (image, cacheRepository) => {
    const name = new DockerName(image);
    assert.equal(name.getCombined(), image);
    assert.equal(name.getRegistryRepo(), image.slice(0, image.lastIndexOf(':')));
    const tag = name.getTag();

    name.setCacheRegistry('cache.example.com');

    assert.equal(name.getRepository(), cacheRepository);
    assert.equal(name.getRegistryRepo(), `cache.example.com/${cacheRepository}`);
    assert.equal(name.getCombined(), `cache.example.com/${cacheRepository}:${tag}`);
    assert.equal(name.getTag(), tag);
  });

  it.each(['org/image', 'ghcr.io/org/image'])(
    'preserves an implicit latest tag for %s',
    (image) => {
      const name = new DockerName(image);
      name.setCacheRegistry('cache.example.com');

      assert.isUndefined(name.getTag());
      assert.equal(name.getCombined(), `cache.example.com/${image}`);
      assert.equal(name.getCombined(true), `cache.example.com/${image}:latest`);
    },
  );
});
