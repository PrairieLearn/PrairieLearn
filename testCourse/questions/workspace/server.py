def generate(data):
    data["params"]["a"] = "WORD"
    data["correct_answers"]["b"] = 35

    data["params"]["_workspace_files"] = [
        {"name": "first_dynamic_file.py", "contents": "a, b = b, a\nprint(a, b)\n"},
        {
            "name": "second_dynamic_file.bin",
            "contents": "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
            "encoding": "hex",
        },
        {
            "name": "path/with/multiple/dynamic/components.bin",
            "contents": "ABEiM0RVZneImaq7zN3u/w==",
            "encoding": "base64",
        },
        {"name": "blank_file.txt", "contents": None},
        {"name": "template_and_dynamic.csv", "contents": "a,b\n1,1\n2,4\n3,9"},
        {
            "name": "reference_file.txt",
            "questionFile": "file_in_question_dir.txt",
        },
        {
            "name": "reference_to_subdir.txt",
            "questionFile": "path/with/another/file.txt",
        },
        {
            "name": "path/../not_normalized.txt",
            "contents": "File identified by path that is not normalized\n",
        },
    ]
