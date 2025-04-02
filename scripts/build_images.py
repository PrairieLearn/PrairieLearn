import hashlib
import json
import os
import subprocess
import sys
import tempfile

# A mapping of images to the base image that they use.
# TODO: Maybe not needed?
BASE_IMAGES = {
    "prairielearn/workspace-vscode-python": "prairielearn/workspace-vscode-base",
    "prairielearn/workspace-vscode-cpp": "prairielearn/workspace-vscode-base",
}

# The container name for the local Docker registry.
REGISTRY_NAME = "prairielearn-registry"

base_images = os.environ.get("BASE_IMAGES", "")
images = os.environ.get("IMAGES", "")
# TODO: better default? OR just always mandate it?
platform = os.environ.get("PLATFORM", "linux/arm64")
should_push = os.environ.get("PUSH_IMAGES", "false").lower() == "true"
tag = os.environ.get("TAG")
metadata_dir = os.environ.get("METADATA_DIR")

if not images:
    print("No images specified. Exiting.")
    sys.exit(1)

if not tag:
    print("No tag specified. Exiting.")
    sys.exit(1)

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

    if image == "prairielearn":
        return "."

    raise ValueError(f"Cannot build unknown image: {image}")


def print_and_run_command(command: list[str]) -> None:
    is_actions = os.environ.get("GITHUB_ACTIONS")
    if is_actions:
        print(f"[command]{' '.join(command)}")
    else:
        print(" ".join(command))

    # Flush `stdout` before running to ensure proper sequencing of output.
    sys.stdout.flush()

    subprocess.run(command, check=True)


base_image_list = base_images.split(",")
image_list = images.split(",")
all_images = base_image_list + image_list

uses_base_image = any(image in BASE_IMAGES for image in image_list)
if uses_base_image:
    # Stop any existing registry container.
    try:
        print_and_run_command(["docker", "stop", REGISTRY_NAME])
        print_and_run_command(["docker", "rm", REGISTRY_NAME])
    except subprocess.CalledProcessError:
        # The container probably didn't exist.
        pass

    print("Starting local Docker registry...")
    print_and_run_command(["docker", "pull", "registry:2"])
    print_and_run_command(
        [
            "docker",
            "run",
            "-d",
            "-p",
            "5000:5000",
            "--name",
            REGISTRY_NAME,
            "registry:2",
        ],
    )


try:
    for image in all_images:
        # Make temporary files for the metadata.
        with tempfile.NamedTemporaryFile(delete=False) as metadata_file:
            pass

        is_base_image = image in base_image_list

        args = [
            "docker",
            "buildx",
            "build",
            "--platform",
            platform,
            "--no-cache",
            "--tag",
            image,
            "--progress",
            "plain",
            "--metadata-file",
            metadata_file.name,
            # We have some images that rely on other images. They're configured to
            # use this arg to determine which base image tag to use.
            "--build-arg",
            f"BASE_IMAGE_TAG={tag}",
            "--build-arg",
            "BASE_IMAGE_REGISTRY=localhost:5000",
        ]

        # if is_base_image:
        #     args.extend(["--load"])
        if should_push:
            args.extend([
                "--output=type=image,push-by-digest=true,name-canonical=true,push=true"
            ])

        args.extend([get_image_path(image)])

        # TODO: conditional building if images have changed.
        print(f"Building image {image} for platform {platform}")
        print_and_run_command(args)

        if is_base_image:
            local_registry_image = f"localhost:5000/{image}:{tag}"
            print(f"Tagging base image {image} for local registry")
            print_and_run_command(["docker", "tag", image, local_registry_image])

            print(f"Pushing base image {image} to local registry")
            print_and_run_command(["docker", "push", local_registry_image])

        with open(metadata_file.name) as f:
            metadata = f.read()

        print(f"Metadata: {metadata.strip()}")

        # Write metadata to the metadata directory
        if metadata_dir:
            build_ref = json.loads(metadata)["buildx.build.ref"]

            # We need a unique name for the metadata file. We'll use the part of the
            # image name after the last slash, and a hash of the build ref.
            name_without_scope = image.split("/")[-1]
            hashed_build_ref = hashlib.sha256(build_ref.encode()).hexdigest()
            metadata_filename = f"{name_without_scope}_{hashed_build_ref}.json"
            with open(os.path.join(metadata_dir, metadata_filename), "w") as f:
                f.write(metadata)

finally:
    # Shut down the local registry if it was started.
    if uses_base_image:
        print("Stopping local Docker registry.")
        print_and_run_command(["docker", "stop", REGISTRY_NAME])
        print_and_run_command(["docker", "rm", REGISTRY_NAME])
