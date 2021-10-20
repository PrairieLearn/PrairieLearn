# Summary

A mechanism for handling course content when PrairieLearn is running on multiple servers.

# Motivation and background

Historically, PrairieLearn has executed on a single server with all course content stored locally on disk. This simple execution model has been very robust and has served us well for many years. However, this has made it difficult to scale PrairieLearn. "Scaling" has thus far meant "run on a bigger server". Ideally, we could autoscale PrairieLearn itself just like we do the fleet of external graders. But to do that, we need to ensure that each instance can access course content.

One potential solution is to use a single shared network filesystem for all course content. When a new instance launches, the network filesystem would be mounted to the instance, and it could access files like normal. However, networked filesystems implementing full Posix semantics appear to be slow for our particular use cases, namely:

- Git operations
- Large numbers of small, frequently-accessed files

For that reason, using a networked filesystem appears to be out of the question.

Another option that's close to the existing model is to clone all repos upon instance startup. However, this impacts our ability to launch servers quickly, as starting a server is now blocked by cloning dozens (in the future, maybe hundreds or thousands) of repos. Additionally, keeping the content in sync and consistent between N servers becomes very challenging.

# Proposed solution

When course content is synced, it will be broken up into a number of chunks:

- A chunk containing all course custom elements
- A chunk for `clientFilesCourse`
- A chunk for `serverFilesCourse`
- A chunk for each course instance's `clientFilesCourseInstance`
- A chunk for each assessment's `clientFilesAssessment`
- A chunk for each question
- A chunk for all question thumbnails

These chunks will be uploaded to some file store with a unique, randomly-generated ID.

When a server needs to use some course content, it will download the necessary chunks to disk. Here are some common pages and the chunks necessary for them:

- Requesting a specific question thumbnail
  - Question thumbnails chunk
- Viewing or grading a question
  - Custom elements chunk
  - Question chunk
  - `serverFilesCourse` chunk
- Serving a file from `clientFilesCourse`
  - `clientFilesCourse` chunk

Note that in many cases, the chunk will have already been loaded to disk for a previous request, and so it can be reused. In fact, this is what makes this method so attractive: it allows us to amortize the cost of loading a course's content over the course of many requests. Files are loaded on-demand and are aggressively cached locally, meaning that requests will only be slightly slower (on the order of hundreds of milliseconds) when they requires course chunks that don't yet exist locally on disk.

## Syncing

In order to sync course content, we'll still need entire course repos to exist _somewhere_ on disk. To avoid the overhead of needing to clone an entire course repo for each sync, we'll dedicate a single PrairieLearn instance solely to syncing operations. This instance will be like the current PrairieLearn server in that it will contain all course repos on disk. We'll configure a load balancer to route all syncing requests to that instance. That instance will then sync metadata to the database and upload the course's chunks as appropriate. Note that this means we don't need a separate service to handle syncing - when running locally, all syncing requests will go to the same server as usual. And servers running in production don't even need to be aware of whether or not they're the syncing instance. This keeps the overall design simple.

To actually sync a course, we'll need two phases. In the first phase, we'll do what we currently do: read all `*.json` files off disk, validate them, and then update the course's database with the new data. The second phase will be where we generate and upload all chunks. First, we'll read a list of all chunks that exist for the course from the database. Then, we'll use `git diff` to determine which files have changed since the last sync. We can then use the list of current chunks and the output of `git diff` to compute a list of chunks that need to be generated. We'll then generate new chunks in the form of `.tar.gz` files, assign them a new UUID, upload new version to the file store, and store their new UUID in the database.

## Chunk persistance

Generated chunks will need to be stored in a file store that's accessible from all instances of PrairieLearn. Currently, S3 appears to be the best option here. It's cheap, reliable, and has minimal latencies (200-300ms in the average case). We're able to tolerate latencies like this because we'll generally only pay the cost once per chunk per instance - once a file is on disk, it won't need to be downloaded again until it changes. Chunks will be stored at a deterministic path in S3 - a likely candidate is `:course_id/:chunk_uuid`.

We also need to be able to quickly look up what the latest version of a particular chunk is. To do that, we should store all chunks in the database. We should add a new `chunks` table with the following columns:

- `id`: Like the rest of our `id` columns, a unique, autogenerated identifier of a particular row
- `uuid`: A unique identifier for the current version of the chunk
- `type`: Identified the chunk type; one of the following:
  - `element`
  - `clientFilesCourse`
  - `serverFilesCourse`
  - `clientFilesCourseInstance`
  - `clientFilesAssessment`
  - `question`
- `course_id`: The ID of the course the chunk is associated with
- `course_instance_id`: The ID of the course instance this chunk is for; null unless `type = 'clientFilesCourseInstance'`
- `assessment_id`: The ID of the assessment that this chunk is for; null unless `type = 'clientFilesAssessment'`
- `question_id`: The ID of the question that this chunk is for; null unless `type = 'question'`

# Potential future optimizations

- We could intelligently preload chunks that we expect to be used soon. For instance, when we get a request for the course question page, we can immediately request the question thumbnails chunk for that course so that it's more likely to be ready by the time we get the request for question thumbnails. Or, when we get a request for an assessment, we can immediately start loading the corresponding `clientFilesAssessment` chunk.
- Over time, assuming instances are relatively long-lived, we'll trend towards all course files for all courses existing on all instances. Ideally, autoscaled instances are running on smaller, cheaper machines with limited resources. This means that over time, we're likely to run out of disk space. To prevent this (or if this someday becomes a problem), we can build an LRU cache on top of this system that will delete old content that hasn't been used in a while.

# Implementation plan

1. (can be done in parallel with the rest) Create an AWS load balancer that can route traffic that requires a local git repo to the single EC2 instance that's running with the checked out repo
1. Syncing
1. File editing
1. File viewing
1. File downloading
1. ...
1. Create new `chunks` table in the database
1. Update syncing code to upload chunks and store their metadata
1. Create function that maps list of changed files (like one would get from `git diff`) to a list of changed chunks
1. Create function that builds a chunk + metadata for a given directory
1. Tarball with directory contents
1. UUID
1. Type
1. Appropriate IDs
1. Upload chunks to S3
1. Update metadata in the `chunks` table
1. If a chunk already exists in the database (as identified by `type` + `course_id` (+ maybe other ID)), overwrite the hash for that chunk
1. Otherwise, insert a new row in the `chunks` table with the appropriate data
1. Load appropriate chunks when performing a given operation
1. Build abstraction that ensures a given set of chunks exist on disk before proceeding
1. For each server, maintain a list of "pending" chunks that maps a S3 key to a Promise
1. When we request a chunk, check if that chunk is on disk in `/chunks`
1. If the chunk is on disk, continue
1. If the chunk is not on disk, check if we're already fetching that chunk by checking the "pending" map
1. If we're already fetching, use the existing Promise
1. If we're not already fetching, create a Promise that will resolve when the below is complete and add it to the "pending" map
1. Load the chunk tarball from S3 to `/wip-chunks`
1. Untar chunk to `tmp`
1. Rename `tmp` to the directory that this chunk should exist add
1. Move the chunk tarball from `/wip-chunks` to `/chunks`
1. Await the promise, remove it from the "pending" map, and then proceed
1. For each route that could need a chunk, use above abstraction to load chunks appropriately
