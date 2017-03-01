const Docker = require('node-docker-api').Docker
const path = require('path');
const fs = require('fs')
const tar = require('tar-fs')
const printStream = require('./stream-utils').printStream
var socket = require('socket.io-client')('http://localhost:3007');

let exiting = false

const docker = new Docker()

// When working in a development environment, we'll queue new jobs here. In
// prod, this will be an SQS queue.
const MAX_WORKERS = 5
let activeWorkers = 0
const devQueue = []
// This will map from Job ID
const activeJobs = {}
async function attemptWorkerStart() {
  if (activeWorkers < MAX_WORKERS && devQueue.length > 0) {
    // Let's fire up a new docker container to grade stuff
    activeWorkers++
    const job = devQueue.shift()
    const dir = job.directory
    const jobId = job.jobId
    if (!dir) {
      console.log(`Job ${jobId}is missing a directory!`)
      return
    }

    var tarStream = tar.pack(dir)
    /*const imageName = `job${jobId}:latest`*/
    const imageName = `job1:latest`
    const containerName = `job${jobId}`

    // Delete the container if it exists, for some reason
    /*docker.container.get(containerName).delete()*/
    /*.then(
      (container) => docker.image.get(`${containerName}:latest`).remove(),
      (err) => console.log('Err removing container')
    ).then(
      () => docker.image.build(tarStream, {
        t: imageName
      }),
      () => docker.image.build(tarStream, {
        t: imageName
      })
    )*/
    /*.then((stream) => printStream(stream),
          (stream) => printStream(stream))
    .then((image) => {
      return  */docker.container.create({
        Image: imageName,
        name: containerName,
        HostConfig: {
          Binds: [
            `${dir}:/grade`
          ]
        }
      })
    /*})*/
    .then((container) => {
      container.start()
      console.log('container started!')
      activeJobs[containerName] = job
      return container.start()
    })
    .then((container) => container.logs({
      follow: true,
      stdout: true,
      stderr: true
    }))
    .then((stream) => {
      stream.on('data', (info) => console.log(info.toString()))
      stream.on('err', (info) => console.log(err.toString()))
    })
    .catch((err) => console.log('err starting container: ' + err))
  }
}

async function workerFinished(containerName) {
  if (!containerName) {
    // rip
    return
  }

  const job = activeJobs[containerName]
  console.log(`container finished: ${containerName}`)
  console.log(job)

  // Read the results out of the mounted directory
  const data = fs.readFileSync(path.join(job.directory, 'results.json'), 'utf8')
  console.log(data)
  socket.emit('result', data)

  docker.container.get(containerName).delete()
  /*.then((container) => docker.image.get(`${containerName}:latest`).remove())*/
  .then(() => {
    // Mark ourselves as finished and attempt to let another run continue
    activeWorkers--
    attemptWorkerStart()
  })
  .catch((err) => console.log('Err finishing task: ' + err))
}

/**
 * Builds all of our base docker images.
 */
async function buildBaseImages() {
  var tarStream = tar.pack(path.join(__dirname, 'demo/'))
  const stream = await docker.image.build(tarStream, {
    t: 'demo'
  })
  printStream(stream)
}

async function startDemoContainer() {
  const container = await docker.container.create({
    Image: 'demo',
    name: 'thisisdemo'
  })
  await container.start()
  container.logs({
    follow: true,
    stdout: true,
    stderr: true
  }).then((stream) => {
    stream.on('data', (info) => console.log(info.toString()))
    stream.on('err', (info) => console.log(err.toString()))
  })
  .catch((error) => console.log(error))
}

/**
 * Handles an event emitted by docker. This includes things like changes in
 * statuses (start and die).
 */
function handleEvent(e) {
  if (exiting) {
    return
  }
  if (e.status === 'start') {
    //console.log("Container started!")
  } else if (e.status === 'die') {
    console.log("Container died!")
    workerFinished(e.Actor.Attributes.name)
  }
}

/**
 * Hooks up our docker event handling function to our docker instance.
 */
async function monitorDockerEvents(handler) {
  var eventStreamHandler = (stream) => new Promise((resolve, reject) => {
    stream.on('data', (d) => {
      handler(JSON.parse(d.toString()))
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  docker.events().then((stream) => eventStreamHandler(stream))
}

// Let's start everything up!
//buildBaseImages()
console.log('hello!')
monitorDockerEvents(handleEvent)
//startDemoContainer()

// This will only be used in a dev environment
// TODO disable this in prod
/*io.on('connection', (socket) => {
  socket.on('new-job', (data) => {
    console.log('new job received!')
    console.log(data)
    devQueue.push(data)
    attemptWorkerStart()
  })
})
io.listen(3007)*/


socket.on('connect', function(){})
socket.on('new-job', function(data) {
  console.log('new job received!')
  console.log(data)
  devQueue.push(data)
  attemptWorkerStart()
})
socket.on('disconnect', function(){})

/*for (let i = 0; i < 30; i++) {
  devQueue.push({
    directory: path.join(__dirname, 'demo/'),
    jobId: i
  })
  attemptWorkerStart()
}*/

function exitHandler() {
  console.log('cleaning up!')
  exiting = true

  var promises = []

  docker.container.list().then((containers) => {
    containers.forEach((container) => {
      //console.log(container)
      console.log('removing!')
      var promise = container.kill()
      .then((container) => container.delete())
      .catch((err) => {})
      promises.push(promise)
    })
  }).then(() => Promise.all(promises))
  .then(() => process.exit(0)).catch((err) => {
    console.log(err)
    process.exit(1)
  })
}

process.on('SIGTERM', exitHandler)
process.on('SIGINT', exitHandler)
