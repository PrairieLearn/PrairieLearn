# CPSC 203 Docker Image

This repository contains all the bits and pieces needed to build and customize a Workspace container for PrairieLearn.

This repository is setup as a "template" so if different configurations are needed (customized for exams, in-class lectures, etc...), this repository should be used a base.

Here is what needs to be done if a **new** image is to be created:

- On GitHub.com (on this page) Click "Use this template"
- Update the new repository name using the following naming convention:
    - workspace_$course_$label ; for this repo, `$course` is `cpsc203` and `$label` can be `primary`.
    - Please keep this repo within the PrairieLearnUBC organization
- Update the Docker image label in the [`docker-build-push.yml.yml` file](https://github.com/PrairieLearnUBC/workspace_cpsc203/blob/main/.github/workflows/docker-build-push.yml#L28-L29) appropriately
    - For example, if `$label` is `lab`, then the `latest` tag should be updated to: `latest-lab` and the SHA tag should be updated to: `lab-${{ env.SHORT_SHA }}`
- Ask the maintainer of the PrairieLearnUBC organization (currently, [Firas Moosv](firas.moosvi@ubc.ca)) to grant the new repo permission to push to the `ubcpl` DockerHub account.
- In your question's `info.json` file, update the `image` field in the `externalGradingOptions` to reflect the new tag
    - For example, `"image": "ubcpl/cpsc203:latest-lab"`
- Remember to sync the Docker Hub image to PL

## Running Docker locally to develop PL workspaces

First pull the PL image (`--platform` flag to deal with M1/M2 macs):

```
docker pull prairielearn/prairielearn --platform linux/amd64
```

`cd` to the parent directory of your PrairieLearn courses (e.g., `pl-ubc-cpsc203`).

Create a new directory where it was created: `/Users/firasm/tmp/pl_ag_jobs`.

Then run this (Update paths as needed) to launch a local instance of PrairieLearn:

```
docker run -it --rm -p 3000:3000 \
--pull=always \
--platform linux/amd64 \
-v ./pl-ubc-cpsc210:/course \
-v ./pl-ubc-cpsc203:/course2 \
-v "/Users/firasm/tmp/pl_ag_jobs:/jobs" \
-e HOST_JOBS_DIR="/Users/firasm/tmp/pl_ag_jobs" \
-v /var/run/docker.sock:/var/run/docker.sock prairielearn/prairielearn
-v /Users/firasm/Sync/Teaching/2023_2024/2023W2/config.json:/PrairieLearn/config.json
```

TODO: FYI, with the last line, we are trying to run workspaces as `coder` instead of `root`; unfortunately this doesn't quite work yet...
Here is the [link to the discussion on this](https://github.com/PrairieLearn/PrairieLearn/discussions/8897):

## Legend of useful files

- [Dockerfile](Dockerfile)
    - Key file that assembles the docker image, installs relevant extensions, copies settings files into the image, and sets up the image
- [.github/workflows/docker-build-push.yml](.github/workflows/docker-build-push.yml)
    - Automatically builds the Docker image and pushes it to Dockerhub (ubcpl/cpsc203)
- [settings.json](settings.json)
    - JSON file that contains all configuration parameters, including code completion, debugger, etc...
- [globalState.json](globalState.json)
    - Allegedly this file has settings that configure the UI to make the interface simpler and less clunky. Doesn't work yet, still a WIP
- [config.json](config.json)
    - Allegedly this config file will help run local workspaces (from within PL running inside Docker) as `coder` instead of `root`. Doesn't work yet, still a WIP.
