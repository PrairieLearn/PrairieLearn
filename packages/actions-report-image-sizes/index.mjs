// @ts-check
import core from '@actions/core';
import github from '@actions/github';

/**
 * @typedef {Object} ChangedImage
 * @property {string} name
 * @property {string} platform
 * @property {string} newTag
 * @property {string} newDigest
 * @property {number | null} oldSize
 * @property {number} newSize
 */

function getImages() {
  const images = core.getInput('images');
  // Allow for both comma and newline separated lists.
  return images.split('\n').flatMap((line) => line.split(',').map((s) => s.trim()));
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

  if (manifestResponse.status === 404) {
    return null;
  }

  return await manifestResponse.json();
}

/**
 *
 * @param {string} image
 * @param {string} sha
 * @returns {Promise<Record<string, { size: number, digest: string }> | null>}
 */
async function getImageSizesFromRegistry(image, sha) {
  const token = await getDockerHubToken(image);
  const manifest = await getImageManifest(token, image, sha);
  if (!manifest) {
    return null;
  }

  // This original manifest will have multiple manifests listed within it.
  // We'll pick out only the ones we want to compare sizes for. Notably, this
  // means excluding attestation manifests. We identify those by os/architecture
  // being "unknown".
  const imageManifests = manifest.manifests.filter(
    (m) => m.platform.os !== 'unknown' && m.platform.architecture !== 'unknown',
  );

  /** @type {Record<string, { size: number, digest: string }>} */
  const sizes = {};

  for (const imageManifest of imageManifests) {
    const platform = `${imageManifest.platform.os}/${imageManifest.platform.architecture}`;

    // Get the manifest for this particular platform image.
    const platformManifest = await getImageManifest(token, image, imageManifest.digest);
    const totalSize = platformManifest.layers.reduce((acc, layer) => acc + layer.size, 0);

    sizes[platform] = { size: totalSize, digest: imageManifest.digest };
  }

  return sizes;
}

/**
 * @param {string} title
 * @param {ChangedImage[]} changedImages
 * @returns {Promise<void>}
 */
async function commentSizeReport(title, changedImages) {
  // Don't comment if there were no changed images.
  if (changedImages.length === 0) return;

  // Don't comment if no token was provided.
  const token = core.getInput('token');
  if (!token) return;

  // Don't comment if this was not a PR event.
  const prNumber = github.context.payload.pull_request?.number;
  if (!prNumber) return;

  // Find existing comment to update; may or may not exist.
  const octokit = github.getOctokit(token);
  const comments = await octokit.paginate(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: prNumber,
    },
  );

  const existingComment = comments.find(
    (comment) =>
      comment.body?.startsWith(`## ${title}`) && comment.user?.login === 'github-actions[bot]',
  );

  // Sort images by name and platform.
  const sortedImages = changedImages.sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.newTag.localeCompare(b.newTag);
  });

  // Generate new comment body.
  const lines = [
    `## ${title}`,
    '',
    // Markdown table header
    '| Image | Platform | Old Size | New Size | Change |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const image of sortedImages) {
    // Remove the leading "sha256:" from the digest and construct a link to the
    // image on Docker Hub.
    const digest = image.newDigest.slice(7);
    const imageLink = `https://hub.docker.com/layers/${image.name}/${image.newTag}/images/sha256-${digest}?context=explore`;

    // Compute sizes and deltas
    const oldSize = image.oldSize ? `${(image.oldSize / 1024 / 1024).toFixed(2)} MB` : 'N/A';
    const newSize = `${(image.newSize / 1024 / 1024).toFixed(2)} MB`;
    const change = image.oldSize
      ? `${((image.newSize / image.oldSize - 1) * 100).toFixed(2)}%`
      : 'N/A';

    lines.push(
      `| [${image.name}:${image.newTag}](${imageLink}) | ${image.platform} | ${oldSize} | ${newSize} | ${change} |`,
    );
  }

  const body = lines.join('\n');

  // Update or create comment.
  if (existingComment) {
    octokit.rest.issues.updateComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      comment_id: existingComment.id,
      body,
    });
  } else {
    octokit.rest.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: prNumber,
      body,
    });
  }
}

/**
 * @param {ChangedImage[]} changedImages
 */
function logSizeReport(changedImages) {
  changedImages.forEach((image) => {
    const delta =
      image.oldSize != null ? ((image.newSize / image.oldSize - 1) * 100).toFixed(2) : null;
    const formattedOldSize = image.oldSize
      ? `${(image.oldSize / 1024 / 1024).toFixed(2)} MB`
      : null;
    const formattedNewSize = `${(image.newSize / 1024 / 1024).toFixed(2)} MB`;
    const formattedDelta = delta ? `${delta}%` : null;
    const size = delta
      ? `${formattedOldSize} -> ${formattedNewSize} (${formattedDelta})`
      : formattedNewSize;
    console.log(`${image.name}:${image.newTag} (${image.platform}): ${size}`);
  });
}

try {
  const images = getImages();
  const title = core.getInput('title');
  const sha = core.getInput('sha');

  /** @type {ChangedImage[]} */
  const changedImages = [];

  for (const image of images) {
    const newRegistrySizes = await getImageSizesFromRegistry(image, sha);

    // If there's no build for this SHA, there's nothing to compare against.
    if (!newRegistrySizes) {
      continue;
    }

    // If there's no previous build, we can't compare sizes, but we can still
    // report the size of the new images.
    const oldRegistrySizes = await getImageSizesFromRegistry(image, 'latest');

    for (const [platform, info] of Object.entries(newRegistrySizes)) {
      const oldSize = oldRegistrySizes?.[platform]?.size ?? null;
      changedImages.push({
        name: image,
        platform,
        newTag: sha,
        newDigest: info.digest,
        oldSize,
        newSize: info.size,
      });
    }
  }

  logSizeReport(changedImages);

  if (changedImages.length > 0) {
    await commentSizeReport(title, changedImages);
  }
} catch (e) {
  console.error(e);
  core.setFailed(e.message);
}
