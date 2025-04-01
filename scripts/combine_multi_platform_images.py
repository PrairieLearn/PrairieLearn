import json
import os
import subprocess
import sys
from collections import defaultdict

metadata_dir = os.environ.get("METADATA_DIR")

if not metadata_dir:
    print("No manifest directory specified!")
    sys.exit(1)


def print_and_run_command(command: list[str]) -> None:
    is_actions = os.environ.get("GITHUB_ACTIONS")
    if is_actions:
        print(f"[command]{' '.join(command)}")
    else:
        print(" ".join(command))

    # Flush `stdout` before running to ensure proper sequencing of output.
    sys.stdout.flush()

    subprocess.run(command, check=True)


# Read all manifests, collect the digests, and group them by image name.
digests_by_image: defaultdict[str, list[str]] = defaultdict(list)

for file in os.listdir(metadata_dir):
    with open(os.path.join(metadata_dir, file)) as f:
        metadata = f.read()
        print(f"Loaded {file} with metadata: {metadata}")

        metadata_json = json.loads(metadata)
        digest = metadata_json["containerimage.digest"]
        image_name = metadata_json["image.name"]

        digests_by_image[image_name].append(digest)

# For each image, make a new image from the digests.
for image_name, digests in digests_by_image.items():
    args = ["docker", "buildx", "imagetools", "create", "--tag", image_name]

    for digest in digests:
        args.extend(("--append", f"{image_name}@{digest}"))

    print(f"Creating image {image_name} with digests: {digests}")
    print_and_run_command(args)
