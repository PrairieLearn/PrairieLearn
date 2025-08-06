import json
import os
from collections import defaultdict

from utils import get_env_or_exit, print_and_run_command


def combine_images_from_metadata_dir(
    metadata_dir: str, *, tags: list[str], registry: str
) -> list[str]:
    """This combines images from the metadata directory into a single image.

    It reads the metadata files in the directory, collects the digests for each image,
    and then creates a new image grouping the digests by image name.
    """
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
        for tag in tags:
            image_name_with_tag = f"{registry}/{image_name}:{tag}"
            args = [
                "docker",
                "buildx",
                "imagetools",
                "create",
                "--tag",
                image_name_with_tag,
            ]

            for digest in digests:
                args.extend([f"{registry}/{image_name}@{digest}"])

            print(f"Creating image {image_name_with_tag} with digests: {digests}")
            print_and_run_command(args)

    return list(digests_by_image.keys())


if __name__ == "__main__":
    metadata_dir = get_env_or_exit("METADATA_DIR")
    tags = get_env_or_exit("TAGS")
    combine_images_from_metadata_dir(
        metadata_dir, tags=tags.split(","), registry="docker.io"
    )
