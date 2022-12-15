#!/usr/bin/env node
// @ts-check
const { execaSudo, getImageTag, getImageName } = require('./util');

(async () => {
  const tag = await getImageTag();
  const imageName = getImageName(tag);

  console.log(`Building image ${imageName}`);
  await execaSudo('docker', ['build', './images/executor', '--tag', imageName]);
  await execaSudo('docker', ['tag', imageName, getImageName('latest')]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
