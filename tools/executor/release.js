#!/usr/bin/env node
// @ts-check
const { execaSudo, getImageName, getImageTag } = require('./util');

(async () => {
  const tag = await getImageTag();
  const imageName = getImageName(tag);

  console.log('Pushing image to Docker registry');
  await execaSudo('docker', ['push', imageName]);

  // Only push with the `latest` tag if this is being run during a master build.
  if (process.env.GITHUB_REF_NAME === 'master') {
    await execaSudo('docker', ['push', getImageName('latest')]);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
