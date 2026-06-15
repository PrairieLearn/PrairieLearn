# PrairieLearn Autograding Images

Within this directory are a set of docker containers for automatically grading student code.
These docker containers may be modified as needed on a per-course basis.

Full details on how externally graded questions are created can be found
in the [Externally Graded Question](https://docs.prairielearn.com/externalGrading/)
documentation.

## Obtaining the Image

To locally develop with one of the PrairieLearn autograding docker images, please use:

```bash
docker pull prairielearn/grader-<language>
```

where `<language>` should be replace with a supported language, e.g. `python`, `r`, and so forth.
