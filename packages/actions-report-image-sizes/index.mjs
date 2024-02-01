import core from '@actions/core';
import github from '@actions/github';

function getImages() {
  const images = core.getInput('images');
  return images.split(',');
}

async function getDockerHubToken(image) {
  const tokenResponse = await fetch(
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${image}:pull`,
  );
  const { token } = await tokenResponse.json();
  return token;
}

async function getImageManifest(token, image, version) {
  const manifestResponse = await fetch(
    `https://registry-1.docker.io/v2/${image}/manifests/${version}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return await manifestResponse.json();
}

async function getImageSizes(image) {
  const token = await getDockerHubToken(image);
  console.log(token);
  const manifest = await getImageManifest(token, image, 'latest');
  console.dir(manifest, { depth: null });
  return 12345;
}

try {
  const images = getImages();
  const title = core.getInput('title');

  for (const image of images) {
    console.log(await getImageSizes(image));
  }

  console.log('Hello, world!', images, title);
} catch (e) {
  console.error(e);
  core.setFailed(e.message);
}
