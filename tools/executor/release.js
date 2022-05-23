#!/usr/bin/env node
// @ts-check
const { execaSudo, getImageName, loginToEcr, getEcrRegistryUrl, getImageTag } = require('./util');

(async () => {
  const tag = await getImageTag();
  const imageName = getImageName(tag);

  console.log('Pushing image to Docker registry');
  await execaSudo('docker', ['push', imageName]);
  await execaSudo('docker', ['push', getImageName('latest')]);

  const ecrRegistryUrl = await getEcrRegistryUrl();
  await loginToEcr();

  // ECR uses immutable tag names, so we can't push a `latest` tag here
  // This is OK, since the ECR registry is only used during production deploys,
  // where we'll already be pinning to a specific version.
  console.log('Pushing image to ECR registry');
  const ecrImageName = `${ecrRegistryUrl}/${imageName}`;
  await execaSudo('docker', ['tag', imageName, ecrImageName]);
  await execaSudo('docker', ['push', ecrImageName]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
