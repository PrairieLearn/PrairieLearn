# Workspaces

This file documents how to create workspace questions.

## Setting up

### `info.json`

The question's `info.json` should contain a `workspaceOptions` dictionary with two keys:

* `image`: Dockerhub image that will be used to serve this question
* `gradedFiles`: list of files or directories that will be copied for grading

A full `info.json` file should look something like:

```json
{
    "uuid": "...",
    "title": "...",
    "topic": "...",
    "tags": [...],
    "type": "v3",
    "workspaceOptions": {
        "image": "prairielearn/grader-python",
        "gradedFiles": [
            "animal.h",
            "animal.cpp"
        ]
    }
}
```
