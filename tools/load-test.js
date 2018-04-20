const _ = require('lodash');
const ERR = require('async-stacktrace');
const request = require('request');
const cheerio = require('cheerio');
const config = require('../lib/config');
const argv = require('yargs-parser') (process.argv.slice(2));

if ('h' in argv || 'help' in argv) {
    const msg = `command line options:
    -h, --help                 Display this help and exit
    --config <filename>        Use this config file
    --server <hostname>        Use this remote server hostname
`;

    console.log(msg); // eslint-disable-line no-console
    process.exit(0);
}

const configFilename = _.get(argv, 'config', 'config.json');
config.loadConfig(configFilename);

const serverHostname = _.get(argv, 'server', 'pl-dev.engr.illinois.edu');

const testList = [
    {'clients': 1, 'iterations': 10},
    {'clients': 10, 'iterations': 10},
];

function avg(values) {
    return _.reduce(values, (a,b) => (a+b)) / _.size(values);
};

async function singleRequest() {
    const startMS = Date.now();
    return new Promise(resolve => setTimeout(() => {
        const endMS = Date.now();
        resolve((endMS - startMS) / 1000);
    }, 10));
};

async function singleClientTest(iterations) {
    let totalTime = 0;
    for (let i = 0; i < iterations; i++) {
        totalTime += await singleRequest();
    }
    return totalTime / iterations;
};

async function singleTest(clients, iterations) {
    let clientTimes = [];
    for (let i = 0; i < clients; i++) {
        clientTimes.push(singleClientTest(iterations));
    }
    let times = await Promise.all(clientTimes);
    return avg(times);
};

async function main() {
    for (let test of testList) {
        const time = await singleTest(test.clients, test.iterations);
        console.log(`Average request time for ${test.clients} clients and ${test.iterations} iterations: ${time} seconds`);
    };
};

main();
