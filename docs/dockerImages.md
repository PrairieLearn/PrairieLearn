# Docker images

PrairieLearn relies on Docker containers to provide isolated environments for student work and grading. These containers allow student submissions, such as coding and scripting, to be executed in an environment that has access to a limited set of data, and does not interfere with other students, course data or PrairieLearn functionality. There are two types of containers currently used in PrairieLearn: [external graders](./externalGrading.md), used for grading student submissions, and [workspaces](./workspaces/index.md), which allow students to interact with a guided user interface.

Docker containers are created from [container images](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/), which are standardized packages that include all files, binaries, libraries, and configurations needed to run a container. PrairieLearn provides and maintains a set of default images that can be used without additional configuration:

- For external grading, graders are provided for [Python](./python-grader/index.md), [C/C++](./c-grader/index.md), [Java](./java-grader/) and [R](https://github.com/PrairieLearn/PrairieLearn/blob/master/graders/r/README.md).
- For workspaces, [multiple images are available](./workspaces/index.md#maintained-workspace-images) depending on the environment and programming language to be used.

Instructors are encouraged to use one of the maintained images, to ensure all security updates and new functionality can be accessed in your questions. Questions may use their own images, though, provided these images allow the question configuration to provide the appropriate functionality needed for external grading and workspaces.

## Custom variations of maintained images

Some questions may require additional customization of existing images, such as the installation of OS dependencies, Python packages, or configuration of OS-level settings. In such cases, instructors may create custom images based on the existing images. This may be done by following these steps:

1. Install [Docker Desktop](https://docs.docker.com/desktop/) in your environment.
2. Create a [Docker Hub](https://hub.docker.com/) account, if you don't yet have one.
3. Create a new directory to hold the information for your image. You may create it in your course repository if you wish to share this with other staff members in your course.
4. In the directory above, create a file named [`Dockerfile`](https://docs.docker.com/reference/dockerfile/) (without an extension), and set its contents to the set of instructions to be used for the image you are creating. For example, to create a custom version of `prairielearn/workspace-vscode-python` with the `datascience` Python package, the file may look like:

   ```dockerfile
   FROM prairielearn/workspace-vscode-python
   RUN pip install datascience
   ```

5. In a terminal, change to the directory that contains the `Dockerfile` above and run the following commands (replacing `yourdockerhubaccount` with your Docker Hub account name, and `yourimagename` with an image name of your choice):

   ```bash
   docker build --platform linux/amd64 -t yourdockerhubaccount/yourimagename .
   docker push yourdockerhubaccount/yourimagename
   ```

6. Change the settings for the question that needs the custom image to use the image name you set above.
7. In your course's "Sync" page, under "Docker images", find the image name above and click on "Sync".

Note that the process above _will not_ cause the image above to be automatically updated if there are changes or additional features to the original image. It is your responsibility to periodically update your custom image by repeating steps 5-7 above.
