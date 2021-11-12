#!/usr/bin/env node
// @ts-check
const { execa, getImageTag, getImageName } = require('./util');

(async () => {
  const tag = await getImageTag();
  const imageName = getImageName(tag);

  console.log(`Building image ${imageName}`);
  await execa('docker', ['build', './images/executor', '--tag', imageName]);
  await execa('docker', ['tag', imageName, getImageName('latest')]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
