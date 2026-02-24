# `pl-file-upload` element

Provides a way to accept file uploads as part of an answer. They will be stored
in the format expected by externally graded questions.

!!! note

    There is a file size limit of **5 MB per answer**. This limit is not customizable as larger
    requests will be rejected by the server. For the same reason, it is also not possible to bypass the
    limit by using multiple `pl-file-upload` elements in the same question. To avoid unexpected errors or
    potentially misleading error messages for large file uploads, we recommend not using more than one
    `pl-file-upload` element per question.

## Sample element

![Screenshot of the pl-file-upload element](pl-file-upload.png)

```html title="question.html"
<pl-file-upload file-names="foo.py, bar.c, filename with\, comma.txt"></pl-file-upload>
```

## Customizations

| Attribute                | Type     | Default | description                                                                                                                                                                                                                                                   |
| ------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file-names`             | CSV list | ""      | List of files that must be submitted. Commas in a filename should be escaped with a backslash, and filenames cannot contain quotes.                                                                                                                           |
| `file-patterns`          | CSV list | ""      | List of file name patterns (see below) that must be submitted. For each pattern, exactly one matching file must be uploaded. Commas and special pattern character should be escaped with a backslash, and filenames cannot contain quotes.                    |
| `optional-file-names`    | CSV list | ""      | List of files that can be submitted, but are optional. Commas should be escaped with a backslash, and filenames cannot contain quotes.                                                                                                                        |
| `optional-file-patterns` | CSV list | ""      | List of file name patterns (see below) that can be submitted, but are optional. For each pattern, any number of matching files can be uploaded. Commas and special pattern character should be escaped with a backslash, and filenames cannot contain quotes. |

## Supported wildcard patterns

The `file-patterns` and `optional-file-patterns` attributes support a number of wildcards to allow a range of file names:

- The `?` placeholder allows a single wildcard character. For example, `solution?.txt` allows
  files like "solution1.txt", "solution2.txt", and so on, but not "solution10.txt".
- The `*` placeholder allows an arbitrary number of wildcard characters. For example, `*.txt`
  allows files like "solution.txt", "my_file.txt", and also ".txt".
- The `[seq]` placeholder allows a single character from the set of options listed inside the square
  brackets. For example, `file_[abc].txt` allows "file_a.txt", "file_b.txt" and "file_c.txt", but not
  "file_x.txt".
- The `[seq]` placeholder also supports ranges like "a-z" or "0-9". For example, `file[0-9].txt`
  allows "file5.txt", but not "filex.txt". Ranges can also be combined. For example,`file[0-9a-z].txt` allows a single alphanumeric
  character and therefore both "file5.txt" and "filex.txt".

!!! note

    `file-patterns` and `optional-file-patterns` accepts [fnmatch](https://docs.python.org/3/library/fnmatch.html) file globs, not regular expressions. Brace expansion (`{foo,bar}.txt`) is not currently supported.

| File pattern       | Allowed :white_check_mark:                        | Disallowed :x:                   |
| ------------------ | ------------------------------------------------- | -------------------------------- |
| `solution?.txt`    | `solution1.txt`, `solution2.txt`, `solutionA.txt` | `solution10.txt`, `solution.txt` |
| `*.txt`            | `solution.txt`, `my_file.txt`, `.txt`             | `solution.py`, `my_file`         |
| `file_[abc].txt`   | `file_a.txt`, `file_b.txt`, `file_c.txt`          | `file_x.txt`, `file_ab.txt`      |
| `file[0-9].txt`    | `file5.txt`, `file0.txt`, `file9.txt`             | `filex.txt`, `file10.txt`        |
| `file[0-9a-z].txt` | `file5.txt`, `filex.txt`, `file0.txt`             | `fileX.txt`, `file10.txt`        |
| `[!_]*.py`         | `solution.py`, `my_file.py`                       | `_foo.py`, `file.txt`            |

If file names or patterns overlap, uploaded files are first used to fill the required file names in `file-names`. Next, files that match a required pattern in `file-patterns` are used to fill that pattern. Any remaining uploaded files are accepted if they match either a name in `optional-file-names` or a pattern in `optional-file-patterns`.

Required files (`file-names` or `file-patterns`) and optional files (`optional-file-names` or `optional-file-patterns`) are handled identically, so if you need to distinguish between the two sets, you should ensure that the patterns don't overlap.

!!! tip

    The same required pattern in `file-patterns` can be repeated, for example `*.py,*.py` means that exactly two Python files must be uploaded. However, different required patterns should not overlap (e.g. `*.py,solution.*`) because files are assigned to a matching pattern arbitrarily, and this can lead to unintended behavior.

## Details

The `pl-file-upload` element and the contents of the uploaded file(s) are only displayed by default in the question panel. If the contents are expected to be listed in the submission panel, they should be explicitly added using other elements such as [`pl-file-preview`](pl-file-preview.md) or [`pl-xss-safe`](pl-xss-safe.md).

## Example implementations

- [demo/autograder/codeUpload]
- [demo/manualGrade/codeUpload]

## See also

- [`pl-file-editor` to provide an in-browser code environment](pl-file-editor.md)
- [`pl-external-grader-results` to include output from autograded code](pl-external-grader-results.md)
- [`pl-code` to display blocks of code with syntax highlighting](pl-code.md)
- [`pl-string-input` for receiving a single string value](pl-string-input.md)

---

[demo/autograder/codeupload]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeUpload
[demo/manualgrade/codeupload]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/manualGrade/codeUpload
