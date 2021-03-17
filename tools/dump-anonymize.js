const fs = require('fs');
const async = require("async");
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { content } = require('googleapis/build/src/apis/content');

infolder = process.argv[2];
outfolder = process.argv[3];

newIds = {};
newUids = {};

function anonymizeAssessmentInstances(contents) {
    console.log(contents);
    process.exit()
}

function anonymizeInstanceQuestions(contents) {
    console.log(contents);
    process.exit()
}

function anonymizeAccessRules(contents) {
    console.log(contents);
    process.exit()
}

function anonymizeSubmissions(contents) {
    console.log(contents);
    process.exit()
}

function anonymizeLog(contents) {
    console.log(contents);
    process.exit()
}

function anonymizeFile(filename, contents) {
    if (filename.endsWith("_instances.json")) {
        return anonymizeAssessmentInstances(contents);
    } else if (filename.endsWith("_instance_questions.json")) {
        return anonymizeInstanceQuestions(contents)
    } else if (filename.endsWith("_access_rules.json")) {
        return anonymizeInstanceQuestions(contents)
    } else if (filename.endsWith("_submissions.json")) {
        return anonymizeInstanceQuestions(contents)
    } else if (filename.endsWith("_log.json")) {
        return anonymizeInstanceQuestions(contents)
    } else if (filename === "assessments.json") {
        return content;
    } else if (filename === "gradebook.json") {
        return content;
    } else if (filename === "download_log.txt") {
        return content;
    } else {
        console.error("Unrecognized File Type: ", filename);
    }
}

function processFile(filename, callback) {
    fullpath = path.join(infolder, filename);
    outpath = path.join(outfolder, filename);
    // console.log(fullpath)
    // callback()
    fs.readFile(fullpath, (err, data) => {
        contents = JSON.parse(data);

        anonymizedContents = anonymizeFile(filename, contents);
        outstring = JSON.stringify(anonymizedContents, null, 2)
        fs.writeFile(outpath, content, err => {
            if (err) {
              console.error(err);
            }
            callback();
        })
    });

}

const files = fs.readdirSync(infolder); 

if (!fs.existsSync(outfolder)){
    fs.mkdirSync(outfolder);
}

async.mapLimit(files, 5, processFile);