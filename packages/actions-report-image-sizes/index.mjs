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
        Accept: ' application/vnd.oci.image.manifest.v1+json',
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

  // This original manifest will have multiple manifests listed within it.
  // We'll pick out only the ones we want to compare sizes for. Notably, this
  // means excluding attestation manifests. We identify those by os/architecture
  // being "unknown".
  const imageManifests = manifest.manifests.filter(
    (m) => m.platform.os !== 'unknown' && m.platform.architecture !== 'unknown',
  );

  const sizes = {};

  for (const imageManifest of imageManifests) {
    const platform = `${imageManifest.platform.os}/${imageManifest.platform.architecture}`;

    // Get the manifest for this particular platform image.
    const platformManifest = await getImageManifest(token, image, imageManifest.digest);
    console.log(platformManifest);
    const totalSize = platformManifest.layers.reduce((acc, layer) => acc + layer.size, 0);

    sizes[platform] = totalSize;
  }

  return sizes;
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
