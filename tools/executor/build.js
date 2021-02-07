#!/usr/bin/env node
// @ts-check
const { execa, getImageName } = require('./util');

(async () => {
  const imageName = await getImageName();

  console.log(`Building image ${imageName}`);
  await execa('docker', ['build', './images/executor', '--tag', imageName]);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
