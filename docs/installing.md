# Installing and running for local course development

This page describes the procedure to install and run your course locally within Docker. You can develop course content locally following the instructions below, or using the [in-browser tools](getStarted.md).

## Installation instructions

Regardless of which operating system you are using, you will need to install the appropriate version of [Docker Desktop](https://www.docker.com/products/docker-desktop/).

If you are using Windows, you are strongly encouraged to also use WSL 2 to run PrairieLearn. WSL 2 provides a Linux environment that runs alongside Windows, and makes better use of modern CPU virtualization features.

Here are the instructions to install WSL 2 and enable its integration with Docker:

- Install WSL 2. For current instructions, [follow the Microsoft documentation](https://learn.microsoft.com/en-us/windows/wsl/install).
- Enable the Docker Desktop WSL 2 backend. For current instructions, [follow the Docker documentation](https://docs.docker.com/desktop/windows/wsl/).
- On the shell of your WSL 2 instance, make sure the instance has the `docker` command installed. The installation process may depend on your distribution, but most distributions provide a `docker` package. For example, if you are using Debian, Ubuntu or similar distributions, you may install it with:

  ```sh
  sudo apt install docker
  ```

**NOTE**: We do not currently support a Windows environment without WSL 2, due to extreme performance issues, limitations related to file permissions in job folders, as well as issues associated to file formats. While there are ways to run PrairieLearn in this environment, it may not provide the same experience that a student would see in a production environment, and as such it is discouraged and not documented. In all cases below, the Windows examples assume that WSL 2 is installed.

## Cloning your course repository

If you are running PrairieLearn with the example course only, you may skip this section.

When you request your course, you will typically receive a GitHub repository URL to your course's content. You may use [Git](https://git-scm.com/) to clone (make a local copy of) this course content in your own computer. Make note of the directory you are cloning your course to. If you are working with multiple courses, you will need to store each course in a separate directory.

If you are using Windows, you have two options to store your course repository(ies):

- Store your course content inside the WSL 2 instance. This option typically provides the best performance when running PrairieLearn locally. You can clone the repository [using git commands](https://git-scm.com/book/en/v2/Git-Basics-Getting-a-Git-Repository) inside your WSL shell. Note that, in this case, you will need to either update your files using WSL tools and editors, or access the files using the Linux file systems. [Instructions to do so are listed here](https://learn.microsoft.com/en-us/windows/wsl/filesystems). In this case, keep track of the path used by your course inside WSL (e.g., `$HOME/pl-tam212`)

- Store your course content in the Windows file system itself (e.g., in your Documents or Desktop folder, or elsewhere inside the C:\ drive). If you are using this option, you will need to translate the Windows path into the WSL mounted path in `/mnt`. For example, if your course is stored in `C:\Users\mwest\Documents\pl-tam212`, then the directory you will use is `/mnt/c/Users/mwest/Documents/pl-tam212` (note the change of prefix and the replacement of backslashes with forward slashes).

## Running instructions

To run PrairieLearn using the example course only, open a terminal window and type the command:

```sh
docker run -it --rm -p 3000:3000 prairielearn/prairielearn
```

To use your own course, use the `-v` flag to bind the Docker `/course` directory with your own course directory. For example, if your course is stored in `$HOME/pl-tam212`, the command is:

```sh
docker run -it --rm -p 3000:3000 -v $HOME/pl-tam212:/course prairielearn/prairielearn
```

Make sure to replace the course path with your own course directory. To use multiple courses, add additional `-v` flags (e.g., `-v /path/to/course1:/course -v /path/to/course2:/course2`). You may use up to nine courses through this method, using the mount points: `/course`, `/course2`, `/course3`, ..., `/course9`.

If you are running on Windows, run the command above in a WSL 2 shell, not on PowerShell or the Command Prompt.

After running the command above, you should see a message that says:

```console
PrairieLearn server ready, press Control-C to quit
```

Once that message shows up, open a web browser and connect to [http://localhost:3000/pl](http://localhost:3000/pl).

When you are finished with PrairieLearn, type Control-C on the terminal where you ran the server to stop it.

### Running on ARM64 hardware

If you're using an Apple Silicon Mac or another ARM-based machine, you may see an error like the following when you try to run the PrairieLearn Docker image:

```
no matching manifest for linux/arm64/v8 in the manifest list entries
```

To fix this, add `--platform linux/amd64` before the image in any `docker run` commands. For example:

```sh
docker run -it --rm -p 3000:3000 --platform linux/amd64 prairielearn/prairielearn
```

When running the image, you may get an error like `pg_ctl: could not start server`. To fix this, open Docker Desktop settings, click on "General", check "Use Rosetta for x86/amd64 emulation on Apple Silicon", and click "Apply & Restart". After Docker Desktop restarts, try the above `docker run ...` command again.

_Note that the use of R in `server.py` is not currently supported on ARM64 hardware._

### Support for external graders and workspaces

In production, PrairieLearn runs external grading jobs and workspaces on a distributed system that uses a variety of AWS services to efficiently run many jobs in parallel. When developing questions locally, you won't have access to this infrastructure, but PrairieLearn allows you to still run external grading jobs and workspaces locally with a few workarounds.

- Instead of running jobs on an EC2 instance, they will be run locally and directly with Docker on the host machine.
- Instead of sending jobs to the grading containers with S3, we write them to a directory on the host machine and then mount that directory directly into the grading container as `/grade`.
- Instead of receiving an SQS message to indicate that results are available, PrairieLearn will simply wait for the grading container to die, and then attempt to read `results/results.json` from the folder that was mounted in as `/grade`.

In order to run external grading jobs when PrairieLearn is running locally inside Docker, there are a few additional preparation steps that are necessary:

- We need a way of starting up Docker containers on the host machine from within another Docker container. We achieve this by mounting the Docker socket from the host into the Docker container running PrairieLearn; this allows us to run 'sibling' containers.
- We need to get job files from inside the Docker container running PrairieLearn to the host machine so that Docker can mount them to `/grade` on the grading machine. We achieve this by mounting a directory on the host machine to `/jobs` on the grading machine, and setting an environment variable `HOST_JOBS_DIR` containing the absolute path of that directory on the host machine.

To run PrairieLearn locally with external grader and workspace support, create an empty directory to use to share job data between containers. This directory can live anywhere, but needs to be created first and referenced in the docker launch command. This directory only needs to be created once. If you are running Windows, the directory should be created inside the WSL 2 instance. You can create this directory using a command like:

```bash
mkdir "$HOME/pl_ag_jobs"
```

Now, run PrairieLearn as usual, but with additional options. For example, if your course directory is in `$HOME/pl-tam212` and the jobs directory created above is in `$HOME/pl_ag_jobs`, and you are using Linux or Mac OS X, the new command is as follows:

```sh
docker run -it --rm -p 3000:3000 \
    -v "$HOME/pl-tam212:/course" `# Replace the path with your course directory` \
    -v "$HOME/pl_ag_jobs:/jobs" `# Map jobs directory into /jobs` \
    -e HOST_JOBS_DIR="$HOME/pl_ag_jobs" \
    -v /var/run/docker.sock:/var/run/docker.sock `# Mount docker into itself so container can spawn others` \
    prairielearn/prairielearn
```

If you are on Windows, you can use the following command on the WSL 2 shell:

```sh
docker run -it --rm -p 3000:3000 \
    -v "$HOME/pl-tam212:/course" `# Replace the path with your course directory` \
    -v "$HOME/pl_ag_jobs:/jobs" `# Map jobs directory into /jobs` \
    -e HOST_JOBS_DIR="$HOME/pl_ag_jobs" \
    -v /var/run/docker.sock:/var/run/docker.sock `# Mount docker into itself so container can spawn others` \
    --add-host=host.docker.internal:172.17.0.1 \
    prairielearn/prairielearn
```

## Upgrading your Docker's version of PrairieLearn

To obtain the latest version of PrairieLearn at any time, make sure PrairieLearn is not running (Ctrl-C it if needed) and then run:

```sh
docker pull prairielearn/prairielearn
```

After this, run PrairieLearn using the same commands as above.

## Running a specific version of PrairieLearn

The commands above will always run the very latest version of PrairieLearn, which might be an unreleased development version. If you would like to run the version that is currently deployed, use the appropriate tag for the server you're using:

- For courses running under https://us.prairielearn.com/ use the tag `us-prod-live`;
- For courses running under https://ca.prairielearn.com/ use the tag `ca-live`;
- For institutions with local installations of PrairieLearn, consult your local IT department.

```sh
docker run -it --rm -p 3000:3000 --pull=always [other args] prairielearn/prairielearn:us-prod-live
```

Note that the command above uses the `--pull=always` option, which will update the local version of the image every time the docker command is restarted. If you keep a long-running container locally, make sure to restart the container when updates in the production servers are announced in the [PrairieLearn GitHub Discussions page](https://github.com/PrairieLearn/PrairieLearn/discussions/categories/announcements).

Additional tags are available for older versions. The list of available versions is viewable on the [Docker Hub build page](https://hub.docker.com/r/prairielearn/prairielearn/builds/).
