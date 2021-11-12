#!/usr/bin/env node
// @ts-check
const { execa, getImageName, loginToEcr, getEcrRegistryUrl, getImageTag } = require('./util');

(async () => {
  const tag = await getImageTag();
  const imageName = getImageName(tag);

  console.log('Pushing image to Docker registry');
  await execa('docker', ['push', imageName]);
  await execa('docker', ['push', getImageName('latest')]);

  const ecrRegistryUrl = await getEcrRegistryUrl();
  await loginToEcr();

  // ECR uses immutable tag names, so we can't push a `latest` tag here
  // This is OK, since the ECR registry is only used during production deploys,
  // where we'll already be pinning to a specific version.
  console.log('Pushing image to ECR registry');
  const ecrImageName = `${ecrRegistryUrl}/${imageName}`;
  await execa('docker', ['tag', imageName, ecrImageName]);
  await execa('docker', ['push', ecrImageName]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
