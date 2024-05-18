def generate(data):
    data["params"]["a"] = "STRING"
    data["correct_answers"]["b"] = 53

    data["params"]["_workspace_files"] = [
        {
            # Valid file
            "name": "dynamic.txt",
            "contents": "This is a dynamic file.\n",
        },
        {
            # File without a name
            "contents": "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
            "encoding": "hex",
        },
        {  # File with invalid encoding
            "name": "invalid_encoding.bin",
            "contents": "ABEiM0RVZneImaq7zN3u/w==",
            "encoding": "utf-4",
        },
        {
            # File that points outside the home directory in name
            "name": "../outside_home.txt",
            "contents": "This file should not be created\n",
        },
        {
            # File whose normalized version points outside the home directory in name
            "name": "path/../../outside_home.txt",
            "contents": "This file should also not be created\n",
        },
        {
            # File with absolute path
            "name": "/home/prairie/absolute.txt",
            "contents": "This file should also not be created\n",
        },
        {
            # File that points outside the question directory in questionFile
            "name": "server.py",
            "questionFile": "../workspace/server.py",
        },
        {
            # File without contents or questionFile
            "name": "no_contents.txt",
        },
    ]
