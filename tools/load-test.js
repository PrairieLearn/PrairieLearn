/* eslint no-console: 0 */ // allow console.log() in this file

const _ = require('lodash');
const request = require('request-promise-native');
const cheerio = require('cheerio');
const assert = require('assert');
const yargsParser = require('yargs-parser');

const config = require('../lib/config');
const csrf = require('../lib/csrf');


const argv = yargsParser(process.argv.slice(2), {
    alias: {
        'help': ['h'],
        'config': ['f'],
        'server': ['s'],
        'iterations': ['n'],
        'clients': ['c'],
    },
    default: {
        'config': 'config.json',
        'server': 'https://pl-dev.engr.illinois.edu',
        'iterations': 10,
        'clients': 1,
    },
});

if ('help' in argv) {
    const msg = `${process.argv[0]} ${process.argv[1]} [options]

command line options:
    -h, --help                Display this help and exit
    -f,--config <filename>    Config file
    -s,--server <url>         Remote server URL
    -n,--iterations <num>     Number of iterations of the test
    -c,--clients <num>        Number of simultaneous clients to test with

Examples:
node tools/load-test.js -n 10 -c 3 -s https://pl-dev.engr.illinois.edu -f ~/git/ansible-pl/prairielearn/config_pl-dev.json
node tools/load-test.js -n 10 -c 3 -s https://prairielearn.engr.illinois.edu -f ~/git/ansible-pl/prairielearn/config_prairielearn.json
`;

    console.log(msg);
    process.exit(0);
}

const exampleCourseName = 'XC 101: Example Course, Spring 2015';
const questionTitle = 'Add two numbers';

config.loadConfig(argv.config);

const serverUrl = argv.server;
const siteUrl = serverUrl;
const baseUrl = siteUrl + '/pl';

const cookies = request.jar();
const loadTestToken = csrf.generateToken('load_test', config.secretKey);
cookies.setCookie(request.cookie(`load_test_token=${loadTestToken}`), siteUrl);

function avg(values) {
    return _.reduce(values, (a,b) => (a+b)) / _.size(values);
}

async function getCourseInstanceUrl() {
    const body = await request({uri: baseUrl, jar: cookies});
    const $ = cheerio.load(body);
    const elemList = $(`td a:contains("${exampleCourseName}")`);
    assert(elemList.length == 1);
    return serverUrl + elemList[0].attribs.href;
}

async function getQuestionUrl(courseInstanceUrl) {
    const questionsUrl = courseInstanceUrl + '/instructor/questions';
    const body = await request({uri: questionsUrl, jar: cookies});
    const $ = cheerio.load(body);
    const elemList = $(`td a:contains("${questionTitle}")`);
    assert(elemList.length == 1);
    return serverUrl + elemList[0].attribs.href;
}

async function getQuestionSubmitInfo(questionUrl) {
    const body = await request({uri: questionUrl, jar: cookies});
    const $ = cheerio.load(body);

    let elemList = $('.question-form input[name="__variant_id"]');
    assert(elemList.length == 1);
    const variant_id = Number.parseInt(elemList[0].attribs.value);

    elemList = $('.question-form input[name="__csrf_token"]');
    assert(elemList.length == 1);
    const csrf_token = elemList[0].attribs.value;

    return {questionUrl, variant_id, csrf_token};
}

async function postQuestionAnswer(questionSubmitInfo) {
    const form = {
        c: Math.floor(Math.random() * 10),
        __action: 'grade',
        __csrf_token: questionSubmitInfo.csrf_token,
        __variant_id: questionSubmitInfo.variant_id,
    };
    const body = await request.post({uri: questionSubmitInfo.questionUrl, jar: cookies, form, followAllRedirects: true});
    const $ = cheerio.load(body);
    let elemList = $('.question-form input[name="__variant_id"]');
    assert(elemList.length == 1);
}

async function singleRequest() {
    const startMS = Date.now();
    const courseInstanceUrl = await getCourseInstanceUrl();
    const questionUrl = await getQuestionUrl(courseInstanceUrl);
    const questionSubmitInfo = await getQuestionSubmitInfo(questionUrl);
    await postQuestionAnswer(questionSubmitInfo);
    const endMS = Date.now();
    return (endMS - startMS) / 1000;
}

async function singleClientTest(iterations, iClient) {
    let totalTime = 0;
    for (let i = 0; i < iterations; i++) {
        console.log(`start (iteration ${i}, client ${iClient})`);
        totalTime += await singleRequest();
        console.log(`end (iteration ${i}, client ${iClient})`);
    }
    return totalTime / iterations;
}

async function singleTest(clients, iterations) {
    let clientTimes = [];
    for (let i = 0; i < clients; i++) {
        clientTimes.push(singleClientTest(iterations, i));
    }
    let times = await Promise.all(clientTimes);
    return avg(times);
}

async function main() {
    try {
        console.log('######################################################################');
        const time = await singleTest(argv.clients, argv.iterations);
        console.log(`Average request time for ${argv.clients} clients and ${argv.iterations} iterations: ${time} seconds`);
    } catch (e) {
        console.log('Error', e);
    }
}

main();
