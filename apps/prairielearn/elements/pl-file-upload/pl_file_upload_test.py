import importlib

import pytest

file_upload = importlib.import_module("pl-file-upload")


@pytest.mark.parametrize(
    "file_list, expected_output",
    [
        ("", []),
        ("test.txt", ["test.txt"]),
        ("test.txt,test2.txt", ["test.txt", "test2.txt"]),
        (
            "test.txt,test2.txt,test3.txt,test4.txt,test5.txt",
            ["test.txt", "test2.txt", "test3.txt", "test4.txt", "test5.txt"],
        ),
        (
            "weird file name,~!@#$%^&*()_\\\\.txt",
            ["weird file name", "~!@#$%^&*()_\\.txt"],
        ),
        (
            "escaped\\,.txt,another_escaped\\,.txt",
            ["escaped,.txt", "another_escaped,.txt"],
        ),
    ],
)
def test_get_file_names_as_array_fn(file_list: str, expected_output: list[str]) -> None:
    output = file_upload.get_file_names_as_array(file_list)
    assert output == expected_output


file_list = ["test.txt", "test.py", "test", "lib.py", "weird name ,~!@#$%^&*()_\\", "."]


@pytest.mark.parametrize(
    "regex_patterns, file_names, expected_output",
    [
        ([], [], set()),
        ([], file_list, set()),
        ([[".*\\.py", "*.py"]], [], set()),
        ([[".*\\.py", "*.py"]], file_list, set(["lib.py", "test.py"])),
        ([["test\\..*", "test.*"]], file_list, set(["test.txt", "test.py"])),
        (
            [["test\\..*", "test.*"], [".*\\.py", "*.py"]],
            file_list,
            set(["test.txt", "test.py", "lib.py"]),
        ),
        (
            [["test\\..*", "test.*"], [".*\\.py", "*.py"], [".*", "*"]],
            file_list,
            set(
                [
                    "test.txt",
                    "test.py",
                    "test",
                    "lib.py",
                    "weird name ,~!@#$%^&*()_\\",
                    ".",
                ]
            ),
        ),
    ],
)
def test_find_matching_files_fn(
    regex_patterns: list[list[str]], file_names: list[str], expected_output: set[str]
) -> None:
    output = file_upload.find_matching_files(regex_patterns, file_names)
    assert output == expected_output


@pytest.mark.parametrize(
    "glob_pattern, expected_output",
    [
        ("", ""),
        ("test", ""),
        ("test*test", "^test.*test$"),
        ("test???test", "^test...test$"),
        ("test[a-z][abc]test", "^test[a-z][abc]test$"),
        ("[a-z0-9][abc]?test*", "^[a-z0-9][abc].test.*$"),
        ("\\[a-z0-9]\\[abc]\\?test\\*", ""),  # All wildcard characters are escaped
        (
            "[*?.].",
            "^[*?.]\\.$",
        ),  # . is a regex character that needs escaping, but characters in ranges don't
    ],
)
def test_glob_to_regex_fn(glob_pattern: str, expected_output: str) -> None:
    output = file_upload.glob_to_regex(glob_pattern)
    assert output == expected_output


@pytest.mark.parametrize(
    "optional_files, expected_output",
    [
        ([], ([], [])),
        (
            [
                "",
                "test",
                "test*test",
                "test???test",
                "test[a-z][abc]test",
                "[a-z0-9][abc]?test*",
                "\\[a-z0-9]\\[abc]\\?test\\*",
                "[*?.].",
            ],
            (
                [
                    ["^test.*test$", "test*test"],
                    ["^test...test$", "test???test"],
                    ["^test[a-z][abc]test$", "test[a-z][abc]test"],
                    ["^[a-z0-9][abc].test.*$", "[a-z0-9][abc]?test*"],
                    ["^[*?.]\\.$", "[*?.]."],
                ],
                ["", "test", "[a-z0-9][abc]?test*"],
            ),
            # test_glob_to_regex_fn already covers individual cases, so testing one big input list
            # being sorted into the two output lists makes more sense here
        ),
    ],
)
def test_extract_patterns_fn(
    optional_files: list[str], expected_output: tuple[list[list[str]], list[str]]
) -> None:
    output = file_upload.extract_patterns(optional_files)
    assert output == expected_output
