## `jupyterlab-base` workspace image

### Creating images from this image

To see an example of a workspace image
built on this base image,
see [the jupyterlab-python folder](../jupyterlab-python).

Note that you need to end the `Dockerfile` with the command
to launch juptyerlab as the default jupyterlab user:

```bash
USER jovyan
CMD ["start.sh", "jupyter", "lab"]
```

### Installing packages

To install packages into this workspace,
you can use the built-in `pip` or `mamba` package managers
(or install any package manager you want).

#### `pip` example

`pip` can be used to install python packages.

```bash
RUN python -m pip install pandas seaborn "altair[all]" otter-grader
RUN pip3 cache purge
```

#### `mamba` example

`mamba` (conda) can be used to install packages
for several different languages,
e.g. R and Python.

```bash
# mamba example:
RUN mamba install --yes \
    'pandas' \
    'seaborn' \
    'altair-all' \
    'otter-grader' \
    'r-base>=4.1' \
    'r-essentials' \
    'r-devtools' \
    'r-gert' \
    'r-usethis' \
    'r-testthat' \
    'r-startup' \
    'r-rmarkdown' \
    'r-stringi' \
    'r-tidyverse' \
    'r-hmisc' \
    'r-rjson' \
    'r-ggally' \
    'r-ggthemes' \
    'r-cowplot' \
    'r-irkernel' && \
    mamba clean --all -f -y && \
    fix-permissions "${CONDA_DIR}" && \
    fix-permissions "/home/${NB_USER}"
```

You can more examples of how to use mamba
in [the jupyter docker stacks](https://github.com/jupyter/docker-stacks/blob/main/images/r-notebook/Dockerfile#L31-L54).
