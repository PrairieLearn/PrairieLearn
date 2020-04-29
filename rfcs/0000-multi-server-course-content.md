# Summary

A mechanism for handling course content when PrairieLearn is running on multiple servers. 

# Motivation and background

Historically, PrairieLearn has executed on a single server with all course content stored locally on disk. This simple execution model has been very robust and has served us well for many years. However, this has made it difficult to scale PrairieLearn. "Scaling" has thus far meant "run on a bigger server. Ideally, we could autoscale PrairieLearn itself just like we do the fleet of external graders. But to do that, we need to ensure that each instance can access course content.

One potential solution is to use a single shared network filesystem for all course content. When a new instance launches, the network filesystem would be mounted to the instance, and it could access files like normal. However, networked filesystems implementing full Posix semantics appear to be slow for our particualr use cases, namely:

* Git operations
* Large numbers of small, frequently-accessed files

For that reason, using a networked filesystem appears to be out of the question.

Another option that's close to the existing model is to clone all repos upon instance startup. However, this impacts our ability to launch servers quickly, as starting a server is now blocked by cloning dozens (in the future, maybe hundreds or thousands) of repos. Additionally, keeping the content in sync and consistent between N servers becomes very challenging.

# Proposed solution

When course content is synced, it will be broken up into a number of chunks:

* One chunk containing all course custom elements
* One chunk for `clientFilesCourse`
* One chunk for `serverFilesCourse`
* A chunk for each course instance's `clientFilesCourseInstance`
* A chunk for each course instance's `serverFilesCourseInstance`
* One chunk for each question
* A chunk for all question thumbnails

These chunks will be uploaded to some file store with a unique, possibly deterministic ID.

When a server needs to use some course content, it will download the necessary chunks to disk. Here are some common pages and the chunks necessary for them:

* Viewing the course question page
  * Question thumbnails chunk
* Viewing or grading a question
  * Custom elements chunk
  * Question chunk
  * `serverFilesCourse` chunk
  * Appropriate `serverFilesCourseInstance` chunk
* Serving a file from `clientFilesCourse`
  * `clientFilesCourse` chunk

Note that in many cases, the chunk will have already been loaded to disk for a previous request, and so it can be reused. In fact, this is what makes this method so attractive: it allows us to amortize the cost of loading a course's content over the course of many requests. Files are loaded on-demand and are aggressively cached locally, meaning that requests will only be slightly slower (on the order of hundreds of milliseconds) when they requires course chunks that don't yet exist locally on disk.

## Syncing

In order to sync course content, we'll still need entire course repos to exist *somewhere* on disk. To avoid the overhead of needing to clone an entire course repo for each sync, we'll dedicate a single PrairieLearn instance solely to syncing operations. This instance will be like the current PrairieLearn server in that it will contain all course repos on disk. We'll configure a load balancer to route all syncing requests to that instance. That instance will then sync metadata to the database and upload the course's chunks as appropriate. Note that this means we don't need a separate service to handle syncing - when running locally, all syncing requests will go to the same server as usual. And servers running in production don't even need to be aware of whether or not they're the syncing instance. This keeps the overall design simple.

When a course instance is synced, we update its git hash in the database. This hash will serve as a unique version identifier for the course's contents. The next time someone tries to access something from the course, we'll check if we already have a working directory for that particular version. If not, we can create one that will store only files for the particular revision, like `/courses/my_course_id/234fae...[hash]...9823efde/`. We'll then start loading files again to this new directory so as not to disrupt any question renders that might be in progress. We can then have a background task that periodically deletes old versions.

## Local storage exhaustion

Over time, the state of the world will trend towards all course files for all courses existing on disk. Ideally, autoscaled instances are running on smaller, cheaper machines with limited resources. This means that over time, we're likely to run out of disk space. To prevent this (or if this someday becomes a problem), we can build an LRU cache on top of this system that will delete old content that hasn't been used in a while.

# Potential future optimizations

* The hash of a chunk's content could be stored and incorporated into its ID; this could be used to optimize syncs to only upload changes chunks. And for servers, they would only need to load a chunk again if its contents have changed.
