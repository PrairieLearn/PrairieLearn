import json
import os
import sys

metadata_dir = os.environ.get("METADATA_DIR")

if not metadata_dir:
    print("No manifest directory specified!")
    sys.exit(1)

# Load every file in the directory

for file in os.listdir(metadata_dir):
    with open(os.path.join(metadata_dir, file)) as f:
        metadata = f.read()
        print(f"Loaded {file} with metadata: {metadata}")

        metadata_json = json.loads(metadata)
        # Do something with the metadata
        # For example, print the image name and platforms
        print(
            f"Image: {metadata_json['name']}, Platforms: {metadata_json['platforms']}"
        )
