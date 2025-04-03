import hashlib
import json
import os
import subprocess
import tempfile
from contextlib import nullcontext

from .utils import get_env_or_exit, local_registry, print_and_run_command

# The container name for the local Docker registry.
REGISTRY_NAME = "prairielearn-registry"

# A mapping from images to their base images. We use this to know to rebuild images when their base image has changed.
BASE_IMAGE_MAPPING = {
    # Core images.
    "prairielearn/prairielearn": "prairielearn/plbase",
    "prairielearn/executor": "prairielearn/prairielearn",
    # Workspace images.
    "prairielearn/workspace-vscode-python": "prairielearn/workspace-vscode-base",
    "prairielearn/workspace-vscode-cpp": "prairielearn/workspace-vscode-base",
}

BASE_IMAGES = list(set(BASE_IMAGE_MAPPING.values()))

images = get_env_or_exit("IMAGES")
tag = get_env_or_exit("TAG")
metadata_dir = os.environ.get("METADATA_DIR")
should_push = os.environ.get("PUSH_IMAGES", "false").lower() == "true"

if not metadata_dir:
    print("No manifest directory specified; manifests will not be created.")


def get_image_path(image: str) -> str:
    if not image.startswith("prairielearn/"):
        raise ValueError(f"Cannot build non-PrairieLearn image: {image}")

    image = image[len("prairielearn/") :]

    if image.startswith("workspace-"):
        image = image[len("workspace-") :]
        return f"workspaces/{image}"

    if image.startswith("grader-"):
        image = image[len("grader-") :]
        return f"graders/{image}"

    if image == "plbase":
        return "images/plbase"

    if image == "executor":
        return "images/executor"

    if image == "prairielearn":
        return "."

    raise ValueError(f"Cannot build unknown image: {image}")


def get_current_platform() -> str:
    result = subprocess.run(
        ["docker", "version", "--format", "json"],
        capture_output=True,
        check=True,
    )
    version_data = json.loads(result.stdout)
    return f"{version_data['Server']['Os']}/{version_data['Server']['Arch']}"


def check_path_modified(path: str) -> bool:
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
    diff_branch = "HEAD^1" if branch == "master" else "remotes/origin/master"

    diff_result = subprocess.run(
        ["git", "diff", "--exit-code", f"{diff_branch}..HEAD", "--", path],
        capture_output=True,
        check=False,
    )

    return diff_result.returncode != 0


# Note that base images must come first in the list so that they're built first.
image_list = images.split(",")
has_base_image = any(image in BASE_IMAGES for image in image_list)


platform = get_current_platform()

built_images: set[str] = set()

with local_registry(REGISTRY_NAME) if has_base_image else nullcontext():
    for image in image_list:
        is_base_image = image in BASE_IMAGES
        base_image = BASE_IMAGE_MAPPING.get(image)
        base_image_built = base_image in built_images
        image_path = get_image_path(image)
        was_modified = check_path_modified(image_path)

        if not was_modified and not base_image_built:
            print(f"Skipping {image} because it hasn't changed.")
            continue

        built_images.add(image)

        # Make temporary files for the metadata.
        with tempfile.NamedTemporaryFile(delete=False) as metadata_file:
            pass

        args = [
            "docker",
            "buildx",
            "build",
            "--platform",
            platform,
            "--no-cache",
            "--tag",
            f"localhost:5000/{image}",
            "--progress",
            "plain",
            "--metadata-file",
            metadata_file.name,
            # "--load",
            "--output=type=image,push-by-digest=true,name-canonical=true,push=true",
        ]

        if base_image and base_image_built:
            args.extend([
                # We have some images that rely on other images. They're configured to
                # use this arg to determine which base image tag to use.
                "--build-arg",
                f"BASE_IMAGE_TAG={tag}",
                "--build-arg",
                "BASE_IMAGE_REGISTRY=localhost:5000",
            ])

        if should_push:
            args.extend([
                # Only tag it with the registry name if we're going to push.
                "--tag",
                image,
            ])

        args.extend([image_path])

        print(f"Building image {image} for platform {platform}")
        print_and_run_command(args)

        with open(metadata_file.name) as f:
            metadata = f.read()

        print(f"Metadata: {metadata.strip()}")
        digest = json.loads(metadata)["containerimage.digest"]

        if is_base_image:
            # `buildx` cannot use locally-built images when the
            # `docker-container` driver is used, and that driver must be used in
            # order to support `push-by-digest`. To make the base image available,
            # we'll push it to a local registry.
            #
            # https://github.com/moby/buildkit/issues/2343
            print_and_run_command([
                "docker",
                "pull",
                f"localhost:5000/{image}@{digest}",
            ])
            print_and_run_command([
                "docker",
                "tag",
                f"localhost:5000/{image}@{digest}",
                f"localhost:5000/{image}:{tag}",
            ])
            print_and_run_command([
                "docker",
                "push",
                f"localhost:5000/{image}:{tag}",
            ])

        # Write metadata to the metadata directory
        if metadata_dir:
            metadata = json.loads(metadata)
            build_ref = metadata["buildx.build.ref"]

            # If pushing is enabled, the image name will be a comma-separated list of image names.
            # We'll replace it with just the plain image name.
            metadata["image.name"] = image

            # We need a unique name for the metadata file. We'll use the part of the
            # image name after the last slash, and a hash of the build ref.
            name_without_scope = image.split("/")[-1]
            hashed_build_ref = hashlib.sha256(build_ref.encode()).hexdigest()
            metadata_filename = f"{name_without_scope}_{hashed_build_ref}.json"
            with open(os.path.join(metadata_dir, metadata_filename), "w") as f:
                json.dump(metadata, f, indent=2)
