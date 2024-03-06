import * as core from '@actions/core';
import * as github from '@actions/github';
import { z } from 'zod';

interface ChangedImage {
  name: string;
  platform: string | null;
  newTag: string;
  newDigest: string;
  oldSize: number | null;
  newSize: number;
}

const DockerApiTokenSchema = z.object({
  token: z.string(),
});

const DockerApiManifestListSchema = z.object({
  mediaType: z.literal('application/vnd.oci.image.index.v1+json'),
  manifests: z.array(
    z.object({
      digest: z.string(),
      platform: z.object({
        os: z.string(),
        architecture: z.string(),
      }),
    }),
  ),
});

const DockerApiManifestSchema = z.object({
  mediaType: z.union([
    z.literal('application/vnd.docker.distribution.manifest.v2+json'),
    z.literal('application/vnd.oci.image.manifest.v1+json'),
  ]),
  layers: z.array(
    z.object({
      digest: z.string(),
      size: z.number(),
    }),
  ),
});

const DockerApiImageManifestSchema = z.union([
  DockerApiManifestListSchema,
  DockerApiManifestSchema,
]);
type DockerApiImageManifest = z.infer<typeof DockerApiImageManifestSchema>;

function getImages(): string[] {
  const images = core.getInput('images');
  // Allow for both comma and newline separated lists.
  return images.split('\n').flatMap((line) => line.split(',').map((s) => s.trim()));
}

async function getDockerHubToken(image: string): Promise<string> {
  const tokenResponse = await fetch(
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${image}:pull`,
  );
  const { token } = DockerApiTokenSchema.parse(await tokenResponse.json());
  return token;
}

async function getImageManifest(
  token: string,
  image: string,
  reference: string,
): Promise<{ manifest: DockerApiImageManifest; digest: string } | null> {
  const url = `https://registry-1.docker.io/v2/${image}/manifests/${reference}`;
  const manifestResponse = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:
        'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json',
    },
  });

  if (manifestResponse.status === 404) {
    console.log(`No manifest found for ${image}:${reference}`);
    return null;
  }

  if (manifestResponse.status === 401) {
    // This can happen if the image does not yet exist in the registry. When we
    // request an auth token with pull permissions for a repository that does
    // not exist, Docker Hub returns a token that silently doesn't include any
    // access permissions at all, and when we go to read the manifest, it fails
    // with an authorization error instead of a 404. We'll treat authorization
    // errors as if the image does not exist.
    console.log(`Authorization error when reading manifest for ${image}:${reference}, skipping...`);
    return null;
  }

  if (!manifestResponse.ok) {
    const status = `${manifestResponse.status} ${manifestResponse.statusText}`;
    throw new Error(`Failed to fetch manifest for ${image}:${reference}: ${status}`);
  }

  const rawManifest = await manifestResponse.json();
  const manifest = DockerApiImageManifestSchema.parse(rawManifest);
  const digest = manifestResponse.headers.get('Docker-Content-Digest');
  if (!digest) {
    throw new Error(`Missing Docker-Content-Digest header for ${url}`);
  }
  return { manifest, digest };
}

async function getAllImagesFromRegistry(
  image: string,
  sha: string,
): Promise<{ platform: string | null; digest: string; size: number }[] | null> {
  const token = await getDockerHubToken(image);
  const manifestResult = await getImageManifest(token, image, sha);
  if (!manifestResult) {
    return null;
  }
  const { manifest, digest } = manifestResult;

  // The manifest may correspond to a either a manifest list (for multi-platform images)
  // or a single manifest. Handle the latter, simpler case first.
  if (manifest.mediaType !== 'application/vnd.oci.image.index.v1+json') {
    const totalSize = manifest.layers.reduce((acc, layer) => acc + layer.size, 0);
    return [
      {
        platform: null,
        digest,
        size: totalSize,
      },
    ];
  }

  // This original manifest will have multiple manifests listed within it.
  // We'll pick out only the ones we want to compare sizes for. Notably, this
  // means excluding attestation manifests. We identify those by os/architecture
  // being "unknown".
  const imageManifests = manifest.manifests.filter(
    (m) => m.platform.os !== 'unknown' && m.platform.architecture !== 'unknown',
  );

  const sizes: { platform: string; digest: string; size: number }[] = [];

  for (const imageManifest of imageManifests) {
    const platform = `${imageManifest.platform.os}/${imageManifest.platform.architecture}`;

    // Get the manifest for this particular platform image.
    const platformManifestResult = await getImageManifest(token, image, imageManifest.digest);
    if (!platformManifestResult) {
      throw new Error(`Could not fetch manifest for ${image}@${imageManifest.digest}`);
    }
    const { manifest: platformManifest } = platformManifestResult;
    if (
      platformManifest.mediaType !== 'application/vnd.docker.distribution.manifest.v2+json' &&
      platformManifest.mediaType !== 'application/vnd.oci.image.manifest.v1+json'
    ) {
      throw new Error(`Unexpected manifest media type: ${platformManifest.mediaType}`);
    }
    const totalSize = platformManifest.layers.reduce((acc, layer) => acc + layer.size, 0);

    sizes.push({ platform, digest: imageManifest.digest, size: totalSize });
  }

  return sizes;
}

async function commentSizeReport(title: string, changedImages: ChangedImage[]) {
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

function logSizeReport(changedImages: ChangedImage[]) {
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

async function main() {
  const images = getImages();
  const title = core.getInput('title');
  const sha = core.getInput('sha');

  const changedImages: ChangedImage[] = [];

  for (const image of images) {
    const newImages = await getAllImagesFromRegistry(image, sha);

    // If there's no build for this SHA, there's nothing to compare against.
    if (!newImages) {
      continue;
    }

    // If there's no previous build, we can't compare sizes, but we can still
    // report the size of the new images.
    const oldImages = await getAllImagesFromRegistry(image, 'latest');

    for (const newImage of newImages) {
      // Find the old image with the same platform. If there isn't a match
      // and the new image doesn't have a platform, try to find an old image for
      // `linux/amd64`. This handles the case of `prairielearn/prairielearn`
      // (which is built during PR CI with a legacy builder that doesn't upload a manifest
      // with an explicit platform).
      //
      // TODO: Build `prairielearn/prairielearn` with buildx and remove this hack.
      let oldImage = oldImages?.find((image) => image.platform === newImage.platform);
      if (!oldImage && newImage.platform === null) {
        oldImage = oldImages?.find((image) => image.platform === 'linux/amd64');
      }
      changedImages.push({
        name: image,
        platform: newImage.platform ?? oldImage?.platform ?? null,
        newTag: sha,
        newDigest: newImage.digest,
        oldSize: oldImage?.size ?? null,
        newSize: newImage.size,
      });
    }
  }

  logSizeReport(changedImages);

  if (changedImages.length > 0) {
    await commentSizeReport(title, changedImages);
  }
}

main().catch((err) => {
  console.error(err);
  core.setFailed(err.message);
});
