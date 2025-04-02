import hashlib
import json
import os
import subprocess
import sys
import tempfile

# The container name for the local Docker registry.
REGISTRY_NAME = "prairielearn-registry"

base_images = os.environ.get("BASE_IMAGES", "")
images = os.environ.get("IMAGES", "")
tag = os.environ.get("TAG")
metadata_dir = os.environ.get("METADATA_DIR")
should_push = os.environ.get("PUSH_IMAGES", "false").lower() == "true"

if not images:
    print("No images specified. Exiting.")
    sys.exit(1)

if not tag:
    print("No tag specified. Exiting.")
    sys.exit(1)

if not metadata_dir:
    print("No manifest directory specified; manifests will not be created.")


def print_and_run_command(command: list[str]) -> None:
    is_actions = os.environ.get("GITHUB_ACTIONS")
    if is_actions:
        print(f"[command]{' '.join(command)}")
    else:
        print(" ".join(command))

    # Flush `stdout` before running to ensure proper sequencing of output.
    sys.stdout.flush()

    subprocess.run(command, check=True)


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


def get_current_platform() -> str:
    result = subprocess.run(
        ["docker", "version", "--format", "json"],
        capture_output=True,
        check=True,
    )
    version_data = json.loads(result.stdout)
    return f"{version_data['Server']['Os']}/{version_data['Server']['Arch']}"


base_image_list = base_images.split(",")
image_list = images.split(",")
all_images = base_image_list + image_list

if base_image_list:
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

platform = get_current_platform()


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
            f"localhost:5000/{image}",
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
            # "--load",
            "--output=type=image,push-by-digest=true,name-canonical=true,push=true",
        ]

        if should_push:
            args.extend([
                # Only tag it with the registry name if we're going to push.
                "--tag",
                image,
            ])

        args.extend([get_image_path(image)])

        # TODO: conditional building if images have changed.
        print(f"Building image {image} for platform {platform}")
        print_and_run_command(args)

        print_and_run_command(["docker", "image", "ls"])

        with open(metadata_file.name) as f:
            metadata = f.read()

        print(f"Metadata: {metadata.strip()}")
        digest = json.loads(metadata)["containerimage.digest"]

        if is_base_image:
            # `buildx` cannot use locally-build images when the
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

finally:
    # Shut down the local registry if it was started.
    if base_image_list:
        print("Stopping local Docker registry.")
        print_and_run_command(["docker", "stop", REGISTRY_NAME])
        print_and_run_command(["docker", "rm", REGISTRY_NAME])
