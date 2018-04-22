/* eslint no-console: 0 */ // allow console.log() in this file

const _ = require('lodash');
const request = require('request-promise-native');
const cheerio = require('cheerio');
const assert = require('assert');
const yargs = require('yargs');

const config = require('../lib/config');
const csrf = require('../lib/csrf');


const argv = yargs
      .option('config', {
          alias: 'f',
          describe: 'JSON configuration file',
          default: 'config.json',
          type: 'string',
      })
      .option('server', {
          alias: 's',
          describe: 'Remote server URL',
          default: 'https://pl-dev.engr.illinois.edu',
          type: 'string',
      })
      .option('iterations', {
          alias: 'n',
          describe: 'Number of test iterations per client',
          default: 3,
          type: 'number',
      })
      .option('clients', {
          alias: 'c',
          describe: 'Number of simultaneous clients to test with (repeat for multiple tests)',
          default: 1,
          type: 'array',
      })
      .example('node tools/load-test.js -n 10 -c 1 3 5 -s https://pl-dev.engr.illinois.edu -f ~/git/ansible-pl/prairielearn/config_pl-dev.json')
      .example('node tools/load-test.js -n 10 -c 1 3 5 -s https://prairielearn.engr.illinois.edu -f ~/git/ansible-pl/prairielearn/config_prairielearn.json')
      .wrap(null)
      .help()
      .alias('help', 'h')
      .version(false)
      .strict()
      .argv;

config.loadConfig(argv.config);

const sleepTimeSec = 10;
const exampleCourseName = 'XC 101: Example Course, Spring 2015';
const questionTitle = 'Add two numbers';

const serverUrl = argv.server;
const siteUrl = serverUrl;
const baseUrl = siteUrl + '/pl';

const cookies = request.jar();
const loadTestToken = csrf.generateToken('load_test', config.secretKey);
cookies.setCookie(request.cookie(`load_test_token=${loadTestToken}`), siteUrl);

function avg(values) {
    return _.reduce(values, (a,b) => (a+b)) / _.size(values);
}

async function sleep(sec) {
    return new Promise(resolve => setTimeout(resolve, sec * 1000));
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
        try {
            totalTime += await singleRequest();
        } catch (e) {
            console.log('Error', e);
            totalTime = NaN
        }
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
        let results = [];
        for (let c of argv.clients) {
            console.log('######################################################################');
            console.log(`Starting test with ${c} clients and ${argv.iterations} iterations`);
            console.log(`Sleeping for ${sleepTimeSec} seconds...`);
            await sleep(sleepTimeSec);
            const time = await singleTest(c, argv.iterations);
            console.log(`Average request time for ${c} clients and ${argv.iterations} iterations: ${time} seconds`);
            results.push({clients: c, iterations: argv.iterations, time});
        }
        console.log('######################################################################');
        for (let r of results) {
            console.log(`Average request time for ${r.clients} clients and ${r.iterations} iterations: ${r.time} seconds`);
        }
    } catch (e) {
        console.log('Error', e);
    }
}

main();
