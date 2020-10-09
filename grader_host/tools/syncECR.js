const ERR = require('async-stacktrace');
const _ = require('lodash');
const debug = require('debug')('syncECR');
const async = require('async');

const Docker = require('dockerode');
const docker = new Docker();

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-2'});
//const ecr = new AWS.ECR();

const dockerUtil = require('../lib/dockerUtil');
const configManager = require('../lib/config');
const config = require('../lib/config').config;
const logger = require('../lib/logger');
const { sqldb } = require('@prairielearn/prairielib');

var imagesText = `alawini/cs411-mongo:latest
alawini/cs411-neo4j
alawini/cs411-sql:latest
altonb/centos7-rpy
altonb/ubuntu-pyspark
bowmannat/javagrader
cs125/quiz:0.0.21
cs125/quiz:0.0.22
cs125/quiz:0.1.9
cs125/quiz:latest
dowobeha/docker-ubuntu-foma
eecarrier/c-and-python-v2
liquidh2/cs427fa18debugging
liquidh2/cs427fa18testing
mattox/clojure-prairielearn
mattox/haskell-prairielearn
mysql-test:latest
nicknytko/cs199-grader:1.0.0
prairielearn/centos7-base
prairielearn/centos7-base:dev
prairielearn/centos7-cs225
prairielearn/centos7-cs418:latest
prairielearn/centos7-java
prairielearn/centos7-ocaml
prairielearn/centos7-python
prairielearn/centos7-verilog
prairielearn/grader-python
prairielearn/grader-r
rahulr2/cs296-25-docker-image
stat430/pl
yrliu/centos7-ece220:v1
zmabry2/cs196-autograde`;

var imageList = imagesText.split(/\r?\n/);
console.log(imageList);
async.series([
    (callback) => {
        configManager.loadConfig((err) => {
            if (ERR(err, callback)) return;
            logger.info('Config loaded:');
            logger.info(JSON.stringify(config, null, 2));
            callback(null);
        });
    },
    (callback) => {
        if (!config.useDatabase) return callback(null);
        var pgConfig = {
            host: config.postgresqlHost,
            database: config.postgresqlDatabase,
            user: config.postgresqlUser,
            password: config.postgresqlPassword,
            max: 2,
            idleTimeoutMillis: 30000,
        };
        logger.info('Connecting to database ' + pgConfig.user + '@' + pgConfig.host + ':' + pgConfig.database);
        var idleErrorHandler = function(err) {
            logger.error('idle client error', err);
        };
        sqldb.init(pgConfig, idleErrorHandler, function(err) {
            if (ERR(err, callback)) return;
            logger.info('Successfully connected to database');
            callback(null);
        });
    },
    (callback) => {
        if (!config.useDatabase) return callback(null);
        var sql = `
        SELECT DISTINCT external_grading_image
        FROM questions AS q
        JOIN pl_courses AS plc ON (q.course_id = plc.id)
        WHERE external_grading_image IS NOT NULL
        AND q.deleted_at IS NULL
        AND plc.deleted_at IS NULL
        ORDER BY external_grading_image;`;
        sqldb.query(sql, {}, (err, result) => {
            if (ERR(err, callback)) return;
            console.log(result.rows);
            callback(null);
        });
    },
    (callback) => {
        dockerUtil.setupDockerAuth((err, auth) => {
            if (ERR(err)) return;

            async.eachSeries(imageList, (image, done) => {
                pullAndPushToECR(image, auth, (err) => {
                    if (ERR(err, done)) return;
                    done(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
], (err) => {
    if (ERR(err)) return;
    sqldb.close((err) => {
        if (ERR(err)) return;
    });
});






function locateImage(image, callback) {
	debug('locateImage');
	docker.listImages(function(err, list) {
	if (ERR(err, callback)) return;
		debug(list);
	for (var i = 0, len = list.length; i < len; i++) {

	if (list[i].RepoTags && list[i].RepoTags.indexOf(image) !== -1) {
	return callback(null, docker.getImage(list[i].Id));
	}
	}

	return callback();
	});
}

function confirmOrCreateECRRepo(repo, callback) {
	const ecr = new AWS.ECR();
	ecr.describeRepositories({}, (err, data) => {
	if (ERR(err, callback)) return;

		var repository_found = _.find(data.repositories, ['repositoryName', repo]);
		if (!repository_found) {

			var params = {
				repositoryName: repo,
			};
			logger.info('ECR: Creating repo ' + repo);
			ecr.createRepository(params, (err) => {
				if (ERR(err, callback)) return;
				callback(null);
			});
		} else {
			// Already exists, nothing to do
			callback(null);
		}
	});
}

var pullAndPushToECR = function(image, dockerAuth, callback) {
	logger.info(`pullAndPushtoECR for ${image}`);

	var repository = new dockerUtil.DockerName(image);
	const params = {
		fromImage: repository.getRepository(),
		tag: repository.getTag() || 'latest'
	};
	logger.info(`Pulling ${repository.getCombined()}`);
	docker.createImage({}, params, (err, stream) => {
        if (err) {
            logger.error(err);
            logger.error('Aborting this image download attempt');
            return callback();
        }
		if (ERR(err, callback)) return;

	//stream.pipe(process.stdout);
	stream.resume();
	stream.on('end', () => {
			logger.info('Pull complete');

			// Find the image we just downloaded
			locateImage(repository.getCombined(true), (err, localImage) => {
				if (ERR(err, callback)) return;

				// Tag the image to add the new registry
				repository.registry = config.cacheImageRegistry;

				var options = {
					repo: repository.getCombined(),
				};

				localImage.tag(options, (err) => {
					if (ERR(err, callback)) return;

					confirmOrCreateECRRepo(repository.getRepository(), (err) => {
						if (ERR(err, callback)) return;

						// Create a new docker image instance with the new registry name
						// localImage isn't specific enough to the ECR repo
						var pushImage = new Docker.Image(docker.modem, repository.getCombined());

						logger.info(`Pushing ${repository.getCombined()}`);
						pushImage.push({}, (err, stream) => {
							if (ERR(err, callback)) return;
							//stream.pipe(process.stdout);
							stream.resume();
							stream.on('end', () => {
								logger.info('Push complete\n');
								callback(null);
							});
						}, dockerAuth);
					});
				});
			});
		});
	});
};
