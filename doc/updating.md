# Updating PrairieLearn

PrairieLearn is frequently updated with new features and bug fixes. If you're running PrairieLearn locally to develop course content, you should periodically update your local version of PrairieLearn to ensure you can take advantage of the latest improvements. Depending on how you're running PrairieLearn, you'll need to take different steps to update. These instructions correspond to the different methods listed on the [running instructions](running.md).

## Running the PrairieLearn Docker image

To update, you just have to pull the latest version of the Docker image. First, make sure that PrairieLearn isn't running. Then, run:

```sh
docker pull prairielearn/prarielearn
```

You can now start your PrairieLearn container again with the [Docker instructions](running-docker.md)

## Running PrairieLearn + PrairieGrader with `docker-compose`

First, pull the latest changes from the PrairieLearn repository onto your machine. From the directory where you cloned the repository, run:

```sh
git checkout master
git pull
```

Then, make sure PrairieLearn isn't running, and run:

```sh
docker-compose pull
```

This will update all of the images needed to run PrairieLearn. You can then start the containers with the [`docker-compose` instructions](running-docker-compose.md).

## Running the PrairieLearn Docker image with local source code

First, pull the latest changes from the PrairieLearn repository onto your machine. From the directory where you cloned the repository, run:

```sh
git checkout master
git pull
```

Now, make sure the Node dependencies are up to date:

```sh
npm install
```

Then, make sure PrairieLearn isn't running, and run:

```sh
docker pull prairielearn/prairielearn
```

You can now start your PrairieLearn container again with the [local instructions](running-local.md).

## Running PrairieLearn natively

First, pull the latest changes from the PrairieLearn repository onto your machine. From the directory where you cloned the repository, run:

```sh
git checkout master
git pull
```

Make sure the Node dependencies are up to date:

```sh
npm install
```

Make sure the Python dependencies are up to date:

```sh
python3 -m pip install -r requirements.txt
```

We periodically update the versions of Python, Node, and Postgres that we use in our Docker images and in production. Check the [`centos7-plbase` Dockerfile](https://github.com/PrairieLearn/PrairieLearn/blob/master/environments/centos7-plbase/Dockerfile) to see what versions are currently being used and update them if needed.

Now, you can start PrairieLearn again with the [native instructions](running-native.md).
