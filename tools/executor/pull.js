#!/usr/bin/env node
// @ts-check
const { execa, execaSudo, getImageTag, getImageName, loginToEcr, getEcrRegistryUrl } = require('./util');

(async () => {
  const tag = await getImageTag();
  const imageName = getImageName(tag);
  const ecrRegistryUrl = await getEcrRegistryUrl();

  await loginToEcr();

  console.log('Pulling image from ECR registry');
  const ecrImageName = `${ecrRegistryUrl}/${imageName}`;
  await execaSudo('docker', ['pull', ecrImageName]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
