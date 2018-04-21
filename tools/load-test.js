const _ = require('lodash');
const ERR = require('async-stacktrace');
const request = require('request-promise-native');
const cheerio = require('cheerio');
const assert = require('assert');
const argv = require('yargs-parser') (process.argv.slice(2));

const config = require('../lib/config');
const csrf = require('../lib/csrf');

if ('h' in argv || 'help' in argv) {
    const msg = `command line options:
    -h, --help             Display this help and exit
    --config <filename>    Use this config file
    --server <url>         Use this remote server URL

Examples:
node tools/load-test.js --server https://pl-dev.engr.illinois.edu --config ~/git/ansible-pl/prairielearn/config_pl-dev.json
node tools/load-test.js --server https://prairielearn.engr.illinois.edu --config ~/git/ansible-pl/prairielearn/config_prairielearn.json
`;

    console.log(msg); // eslint-disable-line no-console
    process.exit(0);
}

const exampleCourseName = 'XC 101: Example Course, Spring 2015';
const questionTitle = 'Add two numbers';

const configFilename = _.get(argv, 'config', 'config.json');
config.loadConfig(configFilename);

const serverUrl = _.get(argv, 'server', 'https://pl-dev.engr.illinois.edu');
const siteUrl = serverUrl;
const baseUrl = siteUrl + '/pl';

const cookies = request.jar();
const loadTestToken = csrf.generateToken('load_test', config.secretKey);
cookies.setCookie(request.cookie(`load_test_token=${loadTestToken}`), siteUrl);

const testList = [
    {'clients': 1, 'iterations': 10},
    {'clients': 3, 'iterations': 10},
    {'clients': 10, 'iterations': 10},
];

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
        for (let test of testList) {
            console.log('######################################################################');
            test.time = await singleTest(test.clients, test.iterations);
            console.log(`Average request time for ${test.clients} clients and ${test.iterations} iterations: ${test.time} seconds`);
        };
        console.log('######################################################################');
        console.log('Summary:');
        for (let test of testList) {
            console.log(`Average request time for ${test.clients} clients and ${test.iterations} iterations: ${test.time} seconds`);
        }
    } catch (e) {
        console.log('Error', e);
    }
}

main();
