## PrairieLearn Autograding R Docker Image

The docker container is from the [versioned `tidyverse` stack](https://github.com/rocker-org/rocker-versioned)
([3.6.1 source](https://github.com/rocker-org/rocker-versioned/blob/master/tidyverse/3.6.1.Dockerfile))
created by the [`rocker`](https://www.rocker-project.org/) project. Ontop of the
versioned `tidyverse` container, we've included packages additional _R_ packages
and a specific user, called `ag`, for PrairieLearn's autograde routine.
