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


for image in images.split(","):
    # Make temporary files for the metadata.
    with tempfile.NamedTemporaryFile(delete=False) as metadata_file:
        pass

    print(f"Building image {image} for platform {platform}")
    # TODO: Log command?
    # TODO: conditional building if images have changed.
    subprocess.run(
        [
            "docker",
            "buildx",
            "build",
            "--platform",
            platform,
            "--push" if should_push else "",
            # TODO: make configurable?
            # "--no-cache",
            "--tag",
            f"{image}:{tag}",
            "--progress",
            "plain",
            "--metadata-file",
            metadata_file.name,
            get_image_path(image),
        ],
        check=True,
    )

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
        with open(os.path.join(metadata_dir, f"{metadata_filename}.json"), "w") as f:
            json.dump(metadata, f)
