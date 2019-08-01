const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

class DockerCaller {
    constructor(hooks) {
        debug('enter constructor()');
        debug(`exit constructor(), state: ${String(this.state)}, uuid: ${this.uuid}`);
    }

    prepareForCourse(course, callback) {
        
    }

    call(file, fcn, args, options, callback) {

    }

    restart() {

    }

    done() {

    }
    
    ensureChild() {

    }
}

/**
 * Used when PrairieLearn is running inside Docker.
 */
class ContainerizedDockerCaller extends DockerCaller {
}

/**
 * Used when PrairieLearn is running natively.
 */
class NativeDockerCaller extends DockerCaller {
}

module.exports.DockerCaller = DockerCaller;
