/* eslint no-console: 0 */ // allow console.log() in this file

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

/* Takes [1, 2, 3]
 * and returns 6
 */
function sum(values) {
    return values.reduce((a,b) => (a+b));
}

/* Takes [1, 2, 3]
 * and returns {mean: 2, stddev: 0.816}
 */
function stats(values) {
    if (values.length == 0) return {mean: NaN, stddev: NaN};
    const mean = sum(values) / values.length;
    const stddev = Math.sqrt(sum(values.map(x => (x-mean)**2)) / values.length);
    return {mean, stddev};
}

/* Takes:
 * {
 *     key1: [1, 2, 3],
 *     key2: [5, 6, 7, 8, 9],
 * }
 * and returns:
 * {
 *     key1: {mean: 2, stddev: 0.816},
 *     key2: {mean: 7, stddev: 1.414},
 * }
 */
function objectStats(obj) {
    const ret = {};
    for (let k in obj) {
        ret[k] = stats(obj[k]);
    }
    return ret;
}

/* Takes:
 * [
 *     {key1: [1, 2, 3], key2: [5, 6, 7, 8, 9]},
 *     {key2: [10, 11], key2: [12, 13, 14]},
 * ]
 * and returns:
 * {
 *     key1: [1, 2, 3, 10, 11],
 *     key2: [5, 6, 7, 8, 9, 12, 13, 14],
 * }
 */
function aggregate(objs) {
    const ret = {};
    for (let obj of objs) {
        for (let key in obj) {
            if (!(key in ret)) ret[key] = [];
            ret[key] = ret[key].concat(obj[key]);
        }
    }
    return ret;
}

async function sleep(sec) {
    return new Promise(resolve => setTimeout(resolve, sec * 1000));
}

async function getCourseInstanceUrl() {
    const body = await request({uri: baseUrl, jar: cookies});
    const $ = cheerio.load(body);
    const elemListCourse = $(`td a:contains("${exampleCourseName}")`);
    assert(elemListCourse.length == 1);
    return serverUrl + elemListCourse[0].attribs.href;
}

async function getQuestionUrl(courseInstanceUrl) {
    const questionsUrl = courseInstanceUrl + '/instructor/questions';
    const body = await request({uri: questionsUrl, jar: cookies});
    const $ = cheerio.load(body);
    const elemListQuestion = $(`td a:contains("${questionTitle}")`);
    assert(elemListQuestion.length == 1);
    return serverUrl + elemListQuestion[0].attribs.href;
}

async function getQuestionSubmitInfo(questionUrl) {
    const body = await request({uri: questionUrl, jar: cookies});
    const $ = cheerio.load(body);

    const elemListVariantId = $('.question-form input[name="__variant_id"]');
    assert(elemListVariantId.length == 1);
    const variant_id = Number.parseInt(elemListVariantId[0].attribs.value);

    const elemListCsrfToken = $('.question-form input[name="__csrf_token"]');
    assert(elemListCsrfToken.length == 1);
    const csrf_token = elemListCsrfToken[0].attribs.value;

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
    const elemListVariantId = $('.question-form input[name="__variant_id"]');
    assert(elemListVariantId.length == 1);
}

async function singleRequest() {
    const totalStartMS = Date.now();
    let startMS;

    startMS = Date.now();
    const courseInstanceUrl = await getCourseInstanceUrl();
    const timeHomepage = (Date.now() - startMS) / 1000;

    startMS = Date.now();
    const questionUrl = await getQuestionUrl(courseInstanceUrl);
    const timeQuestions = (Date.now() - startMS) / 1000;

    startMS = Date.now();
    const questionSubmitInfo = await getQuestionSubmitInfo(questionUrl);
    const timeQuestion = (Date.now() - startMS) / 1000;

    startMS = Date.now();
    await postQuestionAnswer(questionSubmitInfo);
    const timeSubmit = (Date.now() - startMS) / 1000;

    const timeTotal = (Date.now() - totalStartMS) / 1000;

    return {timeHomepage, timeQuestions, timeQuestion, timeSubmit, timeTotal};
}

async function singleClientTest(iterations, iClient) {
    let results = {
        success: [],
        timeHomepage: [],
        timeQuestions: [],
        timeQuestion: [],
        timeSubmit: [],
        timeTotal: [],
    };
    for (let i = 0; i < iterations; i++) {
        console.log(`start (iteration ${i}, client ${iClient})`);
        try {
            const r = await singleRequest();
            results.success.push(1);
            results.timeHomepage.push(r.timeHomepage);
            results.timeQuestions.push(r.timeQuestions);
            results.timeQuestion.push(r.timeQuestion);
            results.timeSubmit.push(r.timeSubmit);
            results.timeTotal.push(r.timeTotal);
        } catch (e) {
            console.log('Error', e);
            results.success.push(0);
        }
        console.log(`end (iteration ${i}, client ${iClient})`);
    }
    return results;
}

async function singleTest(clients, iterations) {
    const clientArray = [];
    for (let i = 0; i < clients; i++) {
        clientArray.push(singleClientTest(iterations, i));
    }
    const clientResults = await Promise.all(clientArray);
    const aggResults = aggregate(clientResults);
    return objectStats(aggResults);
}

async function main() {
    try {
        let results = [];
        for (let c of argv.clients) {
            console.log('######################################################################');
            console.log(`Starting test with ${c} clients and ${argv.iterations} iterations`);
            console.log(`Sleeping for ${sleepTimeSec} seconds...`);
            await sleep(sleepTimeSec);
            const result = await singleTest(c, argv.iterations);
            console.log(`${c} clients, ${argv.iterations} iterations, ${result.success.mean} success`);
            console.log(`homepage: ${result.timeHomepage.mean} +/- ${result.timeHomepage.stddev} s`);
            console.log(`questions: ${result.timeQuestions.mean} +/- ${result.timeQuestions.stddev} s`);
            console.log(`question: ${result.timeQuestion.mean} +/- ${result.timeQuestion.stddev} s`);
            console.log(`submit: ${result.timeSubmit.mean} +/- ${result.timeSubmit.stddev} s`);
            console.log(`total: ${result.timeTotal.mean} +/- ${result.timeTotal.stddev} s`);
            result.clients = c;
            result.iterations = argv.iterations;
            results.push(result);
        }
        console.log('######################################################################');
        console.log('clients,iterations,success,homepage mean,homepage stddev,questions mean,questions stddev,question mean,question stddev,submit mean,submit stddev,total mean,total stddev');
        for (let result of results) {
            console.log(`${result.clients},${result.iterations},${result.success.mean},${result.timeHomepage.mean},${result.timeHomepage.stddev},${result.timeQuestions.mean},${result.timeQuestions.stddev},${result.timeQuestion.mean},${result.timeQuestion.stddev},${result.timeSubmit.mean},${result.timeSubmit.stddev},${result.timeTotal.mean},${result.timeTotal.stddev}`);
        }
    } catch (e) {
        console.log('Error', e);
    }
}

main();
