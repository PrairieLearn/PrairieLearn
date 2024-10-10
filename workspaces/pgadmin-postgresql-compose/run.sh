#!/bin/bash

# Your custom commands go here
echo "Running custom commands..."

# Example command: Create a directory (replace with your own commands)
# mkdir -p /path/to/your/directory

# Example command: Write to a file
# echo "This is a custom message" > /path/to/your/file.txt

# Run the original pgAdmin entrypoint script
exec /entrypoint.sh "$@"
