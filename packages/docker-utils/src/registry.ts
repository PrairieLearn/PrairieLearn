const supportedImageRegistries = new Set([
  'docker.io',
  'index.docker.io',
  'registry-1.docker.io',
  'ghcr.io',
  'quay.io',
  'registry.gitlab.com',
  'public.ecr.aws',
]);

export const imageRegistryHelpText =
  'Use a public image from Docker Hub (docker.io), GHCR (ghcr.io), Quay (quay.io), GitLab (registry.gitlab.com), or Amazon ECR Public (public.ecr.aws).';

export const imageRegistryRestrictionsText =
  'Custom registry domains and explicit ports are not supported.';

export const imageRegistryErrorText = `${imageRegistryHelpText} ${imageRegistryRestrictionsText}`;

/** Checks the source registry without changing the image reference or cache name. */
export function isSupportedImageRegistry(image: string): boolean {
  const slash = image.indexOf('/');
  if (slash === -1) return true;

  // Match Docker's domain detection, including single-label and uppercase hosts:
  // https://github.com/distribution/reference/blob/main/normalize.go
  const first = image.slice(0, slash);
  const hasRegistry = first === 'localhost' || /[.:]/.test(first) || first.toLowerCase() !== first;
  return !hasRegistry || supportedImageRegistries.has(first);
}

export function assertSupportedImageRegistry(image: string): void {
  if (!isSupportedImageRegistry(image)) {
    throw new Error(`Unsupported image registry in "${image}". ${imageRegistryErrorText}`);
  }
}
