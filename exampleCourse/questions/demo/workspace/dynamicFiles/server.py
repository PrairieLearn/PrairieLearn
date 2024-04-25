import base64
import os
import random
import string


def generate(data):
    # Generate 1000 random bytes
    random_binary = os.urandom(1000)
    # Generate 1000 random printable ASCII characters, ending with a line break
    random_text = "".join(random.choices(string.printable, k=1000)) + "\n"

    data["params"]["random_value"] = random.randint(0, 1000)

    data["params"]["_workspace_files"] = [
        # By default, `contents` is interpreted as regular text
        {"name": "static.txt", "contents": "test file with data\n"},
        # The contents can be dynamic
        {"name": "dynamic.txt", "contents": random_text},
        # If the name contains a path, the necessary directories are created
        {"name": "path/with/long/file/name.txt", "contents": random_text},
        # Binary data must be encoded using hex or base64, and the encoding must be provided
        {
            "name": "binary1.bin",
            "contents": random_binary.hex(),
            "encoding": "hex",
        },
        {
            "name": "binary2.bin",
            "contents": base64.b64encode(random_binary).decode(),
            "encoding": "base64",
        },
        # A question file can also be added by using its path in the question instead of its contents
        {"name": "provided.txt", "questionFile": "clientFilesQuestion/provided.txt"},
    ]
