import { expect, it } from 'vitest';

import { isSupportedImageRegistry } from './registry.js';

it.each([
  ['node:24', true],
  ['org/image:tag', true],
  ['docker.io/node:24', true],
  ['index.docker.io/org/image', true],
  ['registry-1.docker.io/org/image', true],
  ['ghcr.io/org/image:tag', true],
  ['quay.io/org/image', true],
  ['registry.gitlab.com/group/project/image:tag', true],
  ['public.ecr.aws/alias/image:tag', true],
  ['internal-host:5000/team/image:tag', false],
  ['internal-host:5000/image:tag', false],
  ['internal.example.com/image', false],
  ['localhost/image', false],
  ['INTERNAL/image', false],
  ['127.0.0.1/image', false],
  ['[::1]/image', false],
  ['ghcr.io.evil.example/org/image', false],
  ['evil.ghcr.io/org/image', false],
  ['ghcr.io:443/org/image', false],
  ['docker.io:5000/org/image', false],
  ['https://ghcr.io/org/image', false],
])('checks the source registry for %s', (image, supported) => {
  expect(isSupportedImageRegistry(image)).toBe(supported);
});
