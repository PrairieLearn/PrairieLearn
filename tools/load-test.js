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
          default: 'http://localhost:3000',
          type: 'string',
      })
      .option('iterations', {
          alias: 'n',
          describe: 'Number of test iterations per client',
          default: 1,
          type: 'number',
      })
      .option('clients', {
          alias: 'c',
          describe: 'Number of simultaneous clients to test with (repeat for multiple tests)',
          default: 1,
          type: 'array',
      })
      .option('delay', {
          alias: 'd',
          describe: 'Delay between tests (seconds)',
          default: 10,
          type: 'number',
      })
      .option('type', {
          alias: 't',
          describe: 'type of question to test',
          default: 'v3',
          choices: ['v2', 'v3'],
      })
      .example('node tools/load-test.js -s http://localhost:3000')
      .example('node tools/load-test.js -n 10 -c 1 3 5 -s https://pl-dev.engr.illinois.edu -f ~/git/ansible-pl/prairielearn/config_pl-dev.json')
      .example('node tools/load-test.js -n 10 -c 1 3 5 -s https://prairielearn.engr.illinois.edu -f ~/git/ansible-pl/prairielearn/config_prairielearn.json')
      .wrap(null)
      .help()
      .alias('help', 'h')
      .version(false)
      .strict()
      .argv;

config.loadConfig(argv.config);

const exampleCourseName = 'XC 101: Example Course, Spring 2015';
let questionTitle;
if (argv.type == 'v2') {
    questionTitle = 'Addition of vectors in Cartesian coordinates';
} else if (argv.type == 'v3') {
    questionTitle = 'Add two numbers';
} else {
    throw new Error(`unknown type: ${argv.type}`);
}

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

    const elemList = $('.question-form input[name="__csrf_token"]');
    assert(elemList.length == 1);
    const csrf_token = elemList[0].attribs.value;

    const questionSubmitInfo = {questionUrl, csrf_token};
    
    if (argv.type == 'v2') {
        const elemList = $('.question-data');
        assert(elemList.length == 1);
        assert(elemList[0].children != null);
        assert(elemList[0].children.length == 1);
        assert(elemList[0].children[0].data != null);
        const questionData = JSON.parse(decodeURIComponent(Buffer.from(elemList[0].children[0].data, 'base64').toString()));
        assert(questionData.variant != null);
        questionSubmitInfo.variant = questionData.variant;
    } else if (argv.type == 'v3') {
        const elemList = $('.question-form input[name="__variant_id"]');
        assert(elemList.length == 1);
        questionSubmitInfo.variant_id = Number.parseInt(elemList[0].attribs.value);
    } else {
        throw new Error(`unknown type: ${argv.type}`);
    }

    return questionSubmitInfo;
}

async function postQuestionAnswer(questionSubmitInfo) {
    let form;

    if (argv.type == 'v2') {
        const submittedAnswer = {
            wx: Math.floor(Math.random() * 10),
            wy: Math.floor(Math.random() * 10),
        };
        form = {
            __action: 'grade',
            __csrf_token: questionSubmitInfo.csrf_token,
            postData: JSON.stringify({variant: questionSubmitInfo.variant, submittedAnswer}),
        };
    } else if (argv.type == 'v3') {
        form = {
            __action: 'grade',
            __csrf_token: questionSubmitInfo.csrf_token,
            __variant_id: questionSubmitInfo.variant_id,
            c: Math.floor(Math.random() * 10),
        };
    } else {
        throw new Error(`unknown type: ${argv.type}`);
    }

    const body = await request.post({uri: questionSubmitInfo.questionUrl, jar: cookies, form, followAllRedirects: true});
    const $ = cheerio.load(body);
    const elemListVariantId = $('.question-form input[name="__csrf_token"]');
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

async function singleClientTest(iterations, iClient, clients) {
    let results = {
        success: [],
        timeHomepage: [],
        timeQuestions: [],
        timeQuestion: [],
        timeSubmit: [],
        timeTotal: [],
    };
    for (let i = 0; i < iterations; i++) {
        console.log(`start (iteration ${i} of ${iterations}, client ${iClient} of ${clients})`);
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
        console.log(`end (iteration ${i} of ${iterations}, client ${iClient} of ${clients})`);
    }
    return results;
}

async function singleTest(clients, iterations) {
    const clientArray = [];
    for (let i = 0; i < clients; i++) {
        clientArray.push(singleClientTest(iterations, i, clients));
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
            console.log(`Sleeping for ${argv.delay} seconds...`);
            await sleep(argv.delay);
            const result = await singleTest(c, argv.iterations);
            console.log(`${c} clients, ${argv.iterations} iterations, ${result.success.mean * 100}% success`);
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
        console.log('clients,iterations,success fraction,homepage mean,homepage stddev,questions mean,questions stddev,question mean,question stddev,submit mean,submit stddev,total mean,total stddev,throughput');
        for (let result of results) {
            console.log(`${result.clients},${result.iterations},${result.success.mean},${result.timeHomepage.mean},${result.timeHomepage.stddev},${result.timeQuestions.mean},${result.timeQuestions.stddev},${result.timeQuestion.mean},${result.timeQuestion.stddev},${result.timeSubmit.mean},${result.timeSubmit.stddev},${result.timeTotal.mean},${result.timeTotal.stddev},${result.clients * result.success.mean / result.timeTotal.mean}`);
        }
    } catch (e) {
        console.log('Error', e);
    }
}

main();
