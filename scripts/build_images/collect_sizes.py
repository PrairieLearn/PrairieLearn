"""Reads image metadata files and outputs an image-sizes.json file."""

import json
import os


def collect_sizes(metadata_dir: str) -> dict:
    """Reads metadata files from the directory and assembles sizes.

    Returns a dict of the form:
    {
        "image_name": {
            "platform": {"size": N, "digest": "sha256:..."},
            ...
        },
        ...
    }
    """
    sizes: dict[str, dict[str, dict[str, int | str]]] = {}

    if not os.path.isdir(metadata_dir):
        print(f"Metadata directory {metadata_dir} does not exist.")
        return sizes

    for filename in sorted(os.listdir(metadata_dir)):
        if not filename.endswith(".json"):
            continue

        filepath = os.path.join(metadata_dir, filename)
        with open(filepath) as f:
            metadata = json.load(f)

        image_name = metadata.get("image.name")
        platform = metadata.get("image.platform")
        image_size = metadata.get("image.size")
        digest = metadata.get("containerimage.digest")

        if not image_name or not platform or image_size is None or not digest:
            raise RuntimeError(f"{filename} is missing required fields")

        if image_name not in sizes:
            sizes[image_name] = {}

        sizes[image_name][platform] = {
            "size": image_size,
            "digest": digest,
        }

    return sizes


if __name__ == "__main__":
    metadata_dir = os.environ.get("METADATA_DIR")
    output_path = os.environ.get("OUTPUT_PATH")

    if not metadata_dir:
        raise RuntimeError("METADATA_DIR environment variable is required")
    if not output_path:
        raise RuntimeError("OUTPUT_PATH environment variable is required")

    sizes = collect_sizes(metadata_dir)

    with open(output_path, "w") as f:
        json.dump(sizes, f, indent=2, sort_keys=True)

    print(f"Wrote {len(sizes)} images to {output_path}")
    for image, platforms in sorted(sizes.items()):
        for platform, info in sorted(platforms.items()):
            print(f"  {image} ({platform}): {info['size']} bytes")
