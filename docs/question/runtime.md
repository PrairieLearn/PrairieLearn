# Question runtime environment

Since PrairieLearn executes your question code in an environment that is not fully user-controlled, it can be useful to have an understanding of exactly how PrairieLearn executes your code. This page discusses the environment where your code is executed in, including which third-party libraries are available and how to install your own.

## General information

All `server.py` files for questions are executed in a Docker container created from the `prairielearn/prairielearn` image. This image includes the Python version that is bundled with the [latest version of Miniconda](https://docs.conda.io/en/latest/miniconda.html), as well as the packages in [`pyproject.toml`](https://github.com/PrairieLearn/PrairieLearn/blob/master/pyproject.toml). The only packages guaranteed to be installed are those listed in the dependencies section of the `pyproject.toml` file.

To run a command line version of this Python environment, you may start it with the following command:

```sh
docker run -it --rm prairielearn/prairielearn /bin/bash
```

## Installing libraries in your course

The quickest way to add custom libraries is to install them directly to your course. This will assume that you are comfortable using Git and Docker. If you are not familiar, it is recommended to follow the [Installing PL for local development](../installing.md) guide.

1. Check out a copy of your course locally with Git, and make sure the main branch is up-to-date.
2. Locate the package that you would like to install. You can find a list of all the available Python libraries at the [Python Package Index](https://pypi.org).
3. In the root directory of your course repository, create a directory named `serverFilesCourse`, if it does not yet exist.
4. Install the package to your course's `serverFilesCourse` directory with the following command. Make sure to replace `<path-to-course>` and `<library>` with the absolute path to the course on your local computer and the library you wish to install, respectively.

   ```sh
   docker run -it --rm -v <path-to-course>:/course prairielearn/prairielearn pip3 install --target /course/serverFilesCourse <library>
   ```

5. Using Git, commit and push the new files that are now in your `serverFilesCourse` directory.

!!! note

    The local installation may generate compiled files that are commonly ignored in `.gitignore`. For example, packages that use native code will typically contain `*.so` files. These files are required for the usage of the installed package, so make sure these files are committed within Git if you encounter issues. Ignored files can be viewed with `git status --ignored`.

After these steps, you should be able to `import` the library as normal in your `server.py` files. If you also wish to use these libraries in an external grader, you will need to ensure your grader image includes these packages as well. Similarly, if you also wish to use these libraries in a workspace, you will again need to ensure your workspace image includes these packages. Both operations may be done by [creating a custom grader or workspace image](../dockerImages.md#custom-variations-of-maintained-images).

## Adding libraries to PrairieLearn

If a library is very large or requires specific dependencies, it may be infeasible to install it directly into your course. In that case, you can open a pull request to add it to PrairieLearn's built-in dependencies. This should be used as a last resort and is subject to maintainer approval. Note that this process will take more time, as your change will have to be reviewed, merged, and deployed. So, only use this in cases where installing directly in your course did not work, and if you reasonably believe the addition of a particular library may benefit the PrairieLearn community in general.

!!! note

    The instructions below assume you have some familiarity with [Git](https://git-scm.com/book/en/v2). If that is not the case, you may request that the library be added by [creating an issue on the PrairieLearn GitHub page](https://github.com/PrairieLearn/PrairieLearn/issues). If you are familiar with Git and you wish to proceed with a pull request, please ensure you are following the [PrairieLearn contributing guidelines](https://github.com/PrairieLearn/PrairieLearn/blob/master/CONTRIBUTING.md).

### Locate the library and version on PyPI

PrairieLearn downloads all of its Python packages from the [Python Package Index](https://pypi.org); your first step should be to locate the package and version you want. You can find the versions under "Release history" on the left. Most of the time the latest version should be chosen unless there is a specific need for an older release.

![SciPy release page](scipy_version.png)
Example for SciPy. The newest release as of writing this guide is `1.6.1`.

### Add the library to `pyproject.toml`

A list of the Python libraries that PrairieLearn uses is stored in the `pyproject.toml` file. Note that there are different dependency files for different environments:

- The `pyproject.toml` file in the root directory is used in the question runtime environment, which mostly affects `server.py` in individual questions and custom elements.
- External graders, like the [Python grader](../python-grader/index.md) or the [C/C++ grader](../c-grader/index.md), have their own set of dependencies in `requirements.txt` in the `graders` directory.
- [Workspaces](../workspaces/index.md), like the Jupyterlab or VSCode environments, have their own set of dependencies in `requirements.txt` in the `workspaces` directory.

Then, create a fork and a new branch, and update the file(s) you wish to modify. In each file you wish to update, add the new library and version on a new line in the format `library==version`, taking care to maintain alphabetical order in the file:

```diff
...
scikit-learn==1.8.0
+scipy==1.16.3
sphinx-markdown-builder==0.6.0
...
```

When you're satisfied with your edits, commit and push your changes, then [create the pull request in the PrairieLearn repository](https://github.com/PrairieLearn/PrairieLearn/pulls).

If you've reached this point, then you're all finished! One of the PrairieLearn maintainers will look over your pull request shortly.
