import os
import tempfile

from build import build_images
from combine import combine_images_from_metadata_dir
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


def get_platforms() -> list[str]:
    """Get the current platform or the platforms specified in the environment variable `PLATFORMS`."""
    platforms = os.environ.get("PLATFORMS")
    if platforms is None:
        return [get_current_platform()]

    # Split the platforms by comma.
    return platforms.split(",")


"""
Usage example:

```sh
IMAGES=prairielearn/workspace-vscode-base,prairielearn/workspace-vscode-python \
TAG=testing-123 \
python3 scripts/build_images/build_multiplatform.py
```
"""
if __name__ == "__main__":
    images = get_env_or_exit("IMAGES")
    tag = get_env_or_exit("TAG")
    platforms = get_platforms()

    # Note that base images must come first in the list so that they're built first.
    image_list = images.split(",")

    with (
        tempfile.TemporaryDirectory() as tmpdir,
        local_registry(REGISTRY_NAME),
        buildx_builder(BUILDER_NAME) as builder,
    ):
        for platform in platforms:
            build_images(
                image_list,
                platform=platform,
                builder=BUILDER_NAME,
                metadata_dir=tmpdir,
            )

        images = combine_images_from_metadata_dir(
            tmpdir,
            tags=[tag],
            registry="localhost:5000",
        )

        for image in images:
            image_with_tag = f"{image}:{tag}"

            print(f"Pulling image {image} from local registry...")
            print_and_run_command([
                "docker",
                "pull",
                f"localhost:5000/{image_with_tag}",
            ])

            print(f"Tagging image {image} without registry qualifier...")
            print_and_run_command([
                "docker",
                "tag",
                f"localhost:5000/{image_with_tag}",
                image_with_tag,
            ])

            print("Removing local registry image...")
            print_and_run_command(["docker", "rmi", f"localhost:5000/{image_with_tag}"])
