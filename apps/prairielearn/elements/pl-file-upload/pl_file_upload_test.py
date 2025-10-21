import hashlib
import importlib

import pytest

file_upload = importlib.import_module("pl-file-upload")


@pytest.mark.parametrize(
    ("file_list", "expected_output"),
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
    ("regex_patterns", "file_names", "limit_1", "expected_output"),
    [
        ([], [], True, ([], [])),
        ([], file_list, False, ([], [])),
        ([".*\\.py"], [], True, ([], [".*\\.py"])),
        ([".*\\.py", ".*\\.py"], [], False, ([], [".*\\.py", ".*\\.py"])),
        ([".*\\.py"], file_list, False, (["test.py", "lib.py"], [])),
        ([".*\\.py"], file_list, True, (["test.py"], [])),
        (
            [".*", ".*\\.py"],
            file_list,
            False,
            (file_list, [".*\\.py"]),
        ),
        (
            [".*\\.py", ".*", "solution\\..*", ".*\\.pdf"],
            file_list,
            True,
            (["test.txt", "test.py"], ["solution\\..*", ".*\\.pdf"]),
        ),
        (
            [".*\\.py", ".*", ".*\\.py", ".*\\.py"],
            file_list,
            True,
            (["test.txt", "test.py", "lib.py"], [".*\\.py"]),
        ),
    ],
)
def test_match_regex_with_files_fn(
    regex_patterns: list[str],
    file_names: list[str],
    limit_1: bool,
    expected_output: tuple[list[str], list[str]],
) -> None:
    output = file_upload.match_regex_with_files(regex_patterns, file_names, limit_1)
    assert output == expected_output


@pytest.mark.parametrize(
    ("glob_pattern", "expected_output"),
    [
        ("test*test", "^test.*test$"),
        ("test???test", "^test...test$"),
        ("test[a-z][abc]test", "^test[a-z][abc]test$"),
        ("[!_]*.py", "^[^_].*\\.py$"),
        ("[a-z0-9][abc]?test*", "^[a-z0-9][abc].test.*$"),
        # . is a regex character that needs escaping, but characters in ranges don't
        (
            "[*?.].",
            "^[*?.]\\.$",
        ),
    ],
)
def test_glob_to_regex_fn(glob_pattern: str, expected_output: str) -> None:
    output = file_upload.glob_to_regex(glob_pattern)
    assert output == expected_output


@pytest.mark.parametrize(
    "glob_pattern",
    [
        ("a/b.txt"),
        ("**/**"),
    ],
)
def test_glob_to_regex_errors(glob_pattern: str) -> None:
    with pytest.raises(ValueError) as _:  # noqa: PT011
        file_upload.glob_to_regex(glob_pattern)


# Function must be backward compatible (i.e., if only file-names is defined, it should
# produce the same has as an older version that only supported file-names)
def test_get_answer_name_backward_compatible() -> None:
    output = file_upload.get_answer_name("test", "", "", "")
    assert output == "_file_upload_" + hashlib.sha1(b"test").hexdigest()


# Function should produce different results for different parameters being used
def test_get_answer_name_parts() -> None:
    output1 = file_upload.get_answer_name("test", "", "", "")
    output2 = file_upload.get_answer_name("", "test", "", "")
    output3 = file_upload.get_answer_name("", "", "test", "")
    output4 = file_upload.get_answer_name("", "", "", "test")
    outputs = {output1, output2, output3, output4}

    assert len(outputs) == 4
