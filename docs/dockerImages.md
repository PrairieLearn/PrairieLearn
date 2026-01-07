# Docker images

PrairieLearn relies on Docker containers to provide isolated environments for student work and grading. These containers allow student submissions, such as coding and scripting, to be executed in an environment that has access to a limited set of data, and does not interfere with other students, course data or PrairieLearn functionality. There are two types of containers currently used in PrairieLearn: [external graders](./externalGrading.md), used for grading student submissions, and [workspaces](./workspaces/index.md), which allow students to interact with a guided user interface.

Docker containers are created from [container images](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/), which are standardized packages that include all files, binaries, libraries, and configurations needed to run a container. PrairieLearn provides and maintains a set of default images that can be used without additional configuration:

- For external grading, graders are provided for [Python](./python-grader/index.md), [C/C++](./c-grader/index.md), [Java](./java-grader/index.md) and [R](https://github.com/PrairieLearn/PrairieLearn/blob/master/graders/r/README.md).
- For workspaces, [multiple images are available](./workspaces/index.md#maintained-workspace-images) depending on the environment and programming language to be used.

Instructors are encouraged to use one of the maintained images, to ensure all security updates and new functionality can be accessed in your questions. Questions may use their own images, though, provided these images allow the question configuration to provide the appropriate functionality needed for external grading and workspaces.

## Custom variations of maintained images

Some questions may require additional customization of existing images, such as the installation of OS dependencies, Python packages, or configuration of OS-level settings. In such cases, instructors may create custom images based on the existing images. This may be done by following these steps:

1. Install [Docker Desktop](https://docs.docker.com/desktop/) in your environment.
2. Create a [Docker Hub](https://hub.docker.com/) account, if you don't yet have one.

   This step should be done by a user that will maintain a long-term association with the course in question, such as a permanent faculty member or support staff, not a teaching assistant or sessional instructor. This will simplify any future updates to custom images, if they become necessary. If multiple users are expected to get access to push these images, you may consider the use of [access tokens](https://docs.docker.com/security/access-tokens/) or [teams](https://docs.docker.com/admin/organization/manage-a-team/).

3. Create a new directory to hold the information for your image. You may create it in your course repository if you wish to share this with other staff members in your course.
4. In the directory above, create a file named [`Dockerfile`](https://docs.docker.com/reference/dockerfile/) (without an extension), and set its contents to the set of instructions to be used for the image you are creating. For example, to create a custom version of `prairielearn/workspace-vscode-python` with the `datascience` Python package, the file may look like:

   ```dockerfile
   FROM prairielearn/workspace-vscode-python
   RUN uv pip install datascience
   ```

5. In a terminal, change to the directory that contains the `Dockerfile` above and build the new image (replacing `yourdockerhubaccount` with your Docker Hub account name, and `yourimagename` with an image name of your choice):

   ```bash
   docker build --platform linux/amd64 -t yourdockerhubaccount/yourimagename .
   ```

   Note that the production environment used by PrairieLearn requires a `linux/amd64` platform for images. As such it is necessary that images are built using this platform, as listed in the `--platform` argument in the command above. This is particularly relevant for users of ARM-based architectures such as Apple Silicon or Windows on Arm systems, since these systems default to `linux/arm64` instead.

6. Once the build process completes, push the image to the Docker Hub registry (again replacing `yourdockerhubaccount` and `yourimagename` as needed):

   ```bash
   docker push yourdockerhubaccount/yourimagename
   ```

7. Change the settings for the question that needs the custom image to use the image name you set above.
8. In your course's "Sync" page, under "Docker images", find the image name above and click on "Sync".

Note that the process above _will not_ cause the image above to be automatically updated if there are changes or additional features to the original image. It is your responsibility to periodically update your custom image by repeating steps 5-8 above.

### Testing custom images locally

For simple custom images that only include one or two extra packages or libraries, following the steps above and testing the image in production may be sufficient to ensure that it works as expected. Similarly, simple changes like updating package versions can be achieved by updating the files from step 4 above, then re-running steps 5-8.

However, for more complex images or more elaborate changes to existing custom images, it is advisable to test the image in a [local PrairieLearn environment](./installing.md#support-for-external-graders-and-workspaces) before pushing it to the production environment. In this scenario, it is important to ensure that the updated version of the image is restricted to the local environment, and that the production environment is not updated with the new image version until testing is complete. While avoiding an image sync (step 8 above) is often enough to prevent this, this may be difficult to ensure in practice, especially if multiple users are working on the same course.

By default, a local installation of PrairieLearn will pull the latest version of the grader/workspace image every time it is used. However, it is possible to change PrairieLearn's configuration to use the local version of an image. This can be done by creating a `config.json` file in any directory of your choice with the following content:

```json title="config.json"
{
  "externalGradingPullImagesFromDockerHub": false,
  "workspacePullImagesFromDockerHub": false
}
```

Then, map this configuration file when [running PrairieLearn](./installing.md#support-for-external-graders-and-workspaces):

```sh
docker run -it --rm -p 3000:3000 \
  -v "/path/to/config.json:/PrairieLearn/config.json" `# Replace the path with your config.json directory` \
  `# Include all other options here...` \
  prairielearn/prairielearn
```

!!! note

    With the configuration above, the local PrairieLearn environment will use the local version of any grader or workspace image when it is needed. This means it is your responsibility to ensure the local version of any image you use is up-to-date, by calling `docker pull IMAGENAME` for any images you are using, including provided and custom images.

!!! note "Testing natively on macOS"

    The configuration reference has a section on [running workspaces / external graders natively on macOS](./dev-guide/configJson.md#running-workspaces-external-graders-natively-on-macos). You will run into permissions errors if you don't do this. This does not apply to users running PrairieLearn via Docker.

Once the configuration above is set, you can modify the `Dockerfile` and related files, then run step 5 from the list above. You can then test the questions that use your custom image to ensure they work as expected. Once you are satisfied that the questions work as expected, proceed with steps 6-8 above. If you made any changes in your questions to account for the changes in the image, make sure your questions are properly synchronized with the production environment as well.
