import json
import os
from collections import defaultdict

from .utils import get_env_or_exit, print_and_run_command

metadata_dir = get_env_or_exit("METADATA_DIR")
tags = get_env_or_exit("TAGS")


# Read all manifests, collect the digests, and group them by image name.
digests_by_image: defaultdict[str, list[str]] = defaultdict(list)

for file in os.listdir(metadata_dir):
    with open(os.path.join(metadata_dir, file)) as f:
        metadata = f.read()
        print(f"Loaded {file} with metadata: {metadata}")

        metadata_json = json.loads(metadata)
        digest = metadata_json["containerimage.digest"]
        image_name = metadata_json["image.name"]

        # In case this contains a tag, strip it off; we'll add it back later.
        image_name_without_tag = image_name.split(":")[0]

        digests_by_image[image_name_without_tag].append(digest)

# For each image, make a new image from the digests.
for image_name, digests in digests_by_image.items():
    for tag in tags.split(","):
        image_name_with_tag = f"{image_name}:{tag}"
        args = [
            "docker",
            "buildx",
            "imagetools",
            "create",
            "--tag",
            image_name_with_tag,
        ]

        for digest in digests:
            args.extend([f"{image_name}@{digest}"])

        print(f"Creating image {image_name_with_tag} with digests: {digests}")
        print_and_run_command(args)
