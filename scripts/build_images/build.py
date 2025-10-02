import functools
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from typing import Literal, cast, get_args

from utils import (
    buildx_builder,
    get_current_platform,
    get_env_or_exit,
    local_registry,
    print_and_run_command,
)

# The container name for the local Docker registry.
REGISTRY_NAME = "prairielearn-registry"

# The name for the `buildx` builder to create and use.
BUILDER_NAME = "prairielearn-builder"

# A mapping from images to their base images. We use this to know to rebuild images when their base image has changed.
BASE_IMAGE_MAPPING = {
    # Core images.
    "prairielearn/executor": "prairielearn/prairielearn",
    # Workspace images.
    "prairielearn/workspace-jupyterlab-python": "prairielearn/workspace-jupyterlab-base",
    "prairielearn/workspace-jupyterlab-r": "prairielearn/workspace-jupyterlab-base",
    "prairielearn/workspace-vscode-python": "prairielearn/workspace-vscode-base",
    "prairielearn/workspace-vscode-cpp": "prairielearn/workspace-vscode-base",
    "prairielearn/workspace-vscode-java": "prairielearn/workspace-vscode-base",
}

BASE_IMAGES = list(set(BASE_IMAGE_MAPPING.values()))

CacheStrategy = Literal["none", "pull", "update"]


def get_image_path(image: str) -> str:
    """Get the path to the Docker context for the given image."""
    if not image.startswith("prairielearn/"):
        raise ValueError(f"Cannot build non-PrairieLearn image: {image}")

    image = image[len("prairielearn/") :]

    if image.startswith("workspace-"):
        image = image[len("workspace-") :]
        return f"workspaces/{image}"

    if image.startswith("grader-"):
        image = image[len("grader-") :]
        return f"graders/{image}"

    if image == "executor":
        return "images/executor"

    if image == "prairielearn":
        return "."

    raise ValueError(f"Cannot build unknown image: {image}")


@functools.cache
def check_path_modified(path: str) -> bool:
    """Check if the given path has been modified since the last commit.

    This is used to determine if we need to rebuild the image.
    """
    branch = (
        subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            check=True,
        )
        .stdout.decode()
        .strip()
    )

    # If this script is being run *on* the master branch, then we want to diff
    # with the previous commit on master. Otherwise, we diff with master itself.
    #
    # In the case of stacked PRs, this will rebuild images if any of the downstack
    # PRs changed the image.
    diff_branch = "HEAD^1" if branch == "master" else "remotes/origin/master"

    diff_result = subprocess.run(
        ["git", "diff", "--exit-code", f"{diff_branch}..HEAD", "--", path],
        capture_output=True,
        check=False,
    )

    return diff_result.returncode != 0


def validate_image_order(images: list[str]) -> None:
    """
    Validates that the images are in the correct order. Base images must come
    first.

    This doesn't strictly check a topological sort, as we allow an image to be
    built without its base image being built in the same run. In that case, we'd
    just pull the base image from the registry. But if we are configured to
    build the base image, it must be built first.
    """
    seen_images = set()
    for image in images:
        seen_images.add(image)
        base_image = BASE_IMAGE_MAPPING.get(image)

        if not base_image or base_image not in images:
            continue

        if base_image not in seen_images:
            raise RuntimeError(
                f"{image} depends on {base_image}, which must be listed first."
            )


def build_image(
    image: str,
    *,
    platform: str,
    builder: str,
    should_push: bool = False,
    base_image_digest: str | None = None,
    metadata_dir: str | None = None,
    cache_strategy: CacheStrategy = "none",
    # Only will use the cache strategy for these images -- all others will be built with cache_strategy="none".
    cache_only: list[str] | None = None,
) -> str:
    """Builds a Docker image. Returns the digest of the built image."""
    base_image = BASE_IMAGE_MAPPING.get(image)
    image_path = get_image_path(image)

    with tempfile.NamedTemporaryFile() as metadata_file:
        args = [
            "docker",
            "buildx",
            "build",
            "--builder",
            builder,
            "--platform",
            platform,
            "--tag",
            f"localhost:5000/{image}",
            "--progress",
            "plain",
            "--metadata-file",
            metadata_file.name,
            "--output=type=image,push-by-digest=true,name-canonical=true,push=true",
        ]

        if base_image and base_image_digest:
            args.extend([
                "--build-context",
                f"{base_image}=docker-image://localhost:5000/{base_image}@{base_image_digest}",
            ])

        if should_push:
            args.extend([
                # Only tag it with the registry name if we're going to push.
                "--tag",
                image,
            ])

        cache_ref = f"{image}:buildcache-{platform.replace('/', '-')}"

        should_cache = cache_only is not None and image in cache_only

        if cache_strategy == "pull" and should_cache:
            # We just want to pull from the cache.
            args.extend([
                "--pull",  # Always attempt to pull all referenced images
                "--cache-from",
                f"type=registry,ref={cache_ref}",
            ])
        elif cache_strategy == "update" and should_cache:
            # We want to not only pull from the cache, but also push to it.
            args.extend([
                "--pull",  # Always attempt to pull all referenced images
                "--cache-from",
                f"type=registry,ref={cache_ref}",
                "--cache-to",
                f"type=registry,ref={cache_ref},mode=max",
            ])
        else:
            args.extend([
                "--no-cache",
            ])

        args.extend([image_path])

        print(f"Building image {image} for platform {platform}")
        print_and_run_command(args)

        with open(metadata_file.name) as f:
            metadata = f.read()

    print(f"Metadata: {metadata.strip()}")
    digest = json.loads(metadata)["containerimage.digest"]

    # Write metadata to the metadata directory
    if metadata_dir:
        metadata = json.loads(metadata)
        build_ref = metadata["buildx.build.ref"]

        # If pushing is enabled, the image name will be a comma-separated list of image names.
        # We'll replace it with just the plain image name.
        metadata["image.name"] = image

        # We need a unique name for the metadata file. We'll use the part of the
        # image name after the last slash, and a hash of the build ref.
        name_without_scope = image.rsplit("/", maxsplit=1)[-1]
        hashed_build_ref = hashlib.sha256(build_ref.encode()).hexdigest()
        metadata_filename = f"{name_without_scope}_{hashed_build_ref}.json"
        with open(os.path.join(metadata_dir, metadata_filename), "w") as f:
            json.dump(metadata, f, indent=2)

    return digest


def build_images(
    images: list[str],
    *,
    platform: str,
    builder: str,
    should_push: bool = False,
    only_changed: bool = False,
    metadata_dir: str | None = None,
    cache_strategy: CacheStrategy = "none",
    cache_only: list[str] | None = None,
) -> None:
    """Builds a list of Docker images in the order they are given."""
    validate_image_order(images)

    image_digests: dict[str, str] = {}

    for image in images:
        base_image = BASE_IMAGE_MAPPING.get(image)
        base_image_built = base_image in image_digests
        base_image_digest = image_digests.get(base_image) if base_image else None
        image_path = get_image_path(image)
        was_modified = not only_changed or check_path_modified(image_path)

        if not was_modified and not base_image_built:
            print(f"Skipping {image} because it hasn't changed.")
            continue

        digest = build_image(
            image,
            platform=platform,
            builder=builder,
            should_push=should_push,
            base_image_digest=base_image_digest,
            metadata_dir=metadata_dir,
            cache_strategy=cache_strategy,
            cache_only=cache_only,
        )

        image_digests[image] = digest


if __name__ == "__main__":
    images = get_env_or_exit("IMAGES")
    metadata_dir = os.environ.get("METADATA_DIR")
    should_push = os.environ.get("PUSH_IMAGES", "false").lower() == "true"
    only_changed = os.environ.get("ONLY_CHANGED", "false").lower() == "true"
    cache_strategy = os.environ.get("CACHE_STRATEGY", "none").lower()
    cache_only_str = os.environ.get("CACHE_ONLY", "")
    if cache_only_str:
        cache_only = cache_only_str.split(",")
    else:
        cache_only = None

    if cache_strategy not in get_args(CacheStrategy):
        raise ValueError(f"Invalid cache strategy: {cache_strategy}")
    cache_strategy = cast(CacheStrategy, cache_strategy)

    if metadata_dir:
        os.makedirs(metadata_dir, exist_ok=True)
    else:
        print("No metadata directory specified; metadata files will not be created.")

    platform = get_current_platform()

    # Note that base images must come first in the list so that they're built first.
    image_list = images.split(",")

    if only_changed and not any(
        check_path_modified(get_image_path(image)) for image in image_list
    ):
        print("No images have changed; skipping build.")
        sys.exit(0)

    with (
        local_registry(REGISTRY_NAME),
        buildx_builder(BUILDER_NAME) as builder,
    ):
        build_images(
            image_list,
            platform=platform,
            builder=BUILDER_NAME,
            should_push=should_push,
            only_changed=only_changed,
            metadata_dir=metadata_dir,
            cache_strategy=cache_strategy,
            cache_only=cache_only,
        )
