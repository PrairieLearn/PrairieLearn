import hashlib
import json
import os
import subprocess
import sys
import tempfile

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


def print_command(command: list[str]) -> None:
    is_actions = os.environ.get("GITHUB_ACTIONS")
    if is_actions:
        print(f"[command]{' '.join(command)}")
    else:
        print(" ".join(command))


for image in images.split(","):
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
        # We can't tag with the actual desired tag because that conflicts
        # with `push-by-digest=true`. We'll tag it separately later.
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
        # Always load the image to produce ...
        "--load",
    ]

    if should_push:
        args.extend([
            "--output=type=image,push-by-digest=true,name-canonical=true,push=true"
        ])

    args.extend([get_image_path(image)])

    # TODO: conditional building if images have changed.
    print(f"Building image {image} for platform {platform}")
    print_command(args)
    subprocess.run(args, check=True)

    print(f"Tagging image {image} with tag {tag}")
    tag_args = ["docker", "image", "tag", f"{image}", f"{image}:{tag}"]
    print_command(tag_args)
    subprocess.run(tag_args, check=True)

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
