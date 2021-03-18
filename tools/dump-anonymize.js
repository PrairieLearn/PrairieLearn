const fs = require('fs');
const async = require("async");
const { v4: uuidv4 } = require('uuid');
const path = require('path');

infolder = process.argv[2];
outfolder = process.argv[3];

function getUUID(map, key){
    if (!map[key]) {
        map[key] = uuidv4();
    }
    return map[key];
}

newUserIds = {};
newUserUids = {};
newUserNames = {};

// function replaceUserId() {

// }
// function replaceUserUid() {
    
// }
// function replaceUserName() {
    
// }

function anonymizeAssessmentInstances(contents) {
    // TODO: the course I'm currently dealing with doesn't have an 
    // IDs here but is that always true?
    // console.log(contents);
    for (let instance of contents) {
        if (instance["user_id"]) {
            instance.user_id = getUUID(newUserIds, instance.user_id);
        }

        if (instance["user_uid"]) {
            instance.user_uid = getUUID(newUserUids, instance.user_uid);
        }

        if (instance["user_name"]) {
            instance.user_name = getUUID(newUserNames, instance.user_name);
        }

        if (instance["auth_user_uid"]) {
            instance.auth_user_uid = getUUID(newUserUids, instance.auth_user_uid);
        }

        if (instance["uids"]) {
            let newUids = [];
            for (uid of instance.uids) {
                // console.log(uid)
                newUids.push(getUUID(newUserUids, uid));
            }
            instance.uids = newUids;
            // console.log(instance.uids)
            // console.log(contents);

        }
    }
    // console.log(contents);
    return contents;
}

function anonymizeInstanceQuestions(contents) {
    console.log(contents);
    // process.exit()
    return contents;
}

function anonymizeAccessRules(contents) {
    return contents;
}

function anonymizeSubmissions(contents) {
    // console.log(contents);
    // process.exit()
    return contents;
}

function anonymizeLog(contents) {
    // console.log(contents);
    // process.exit()
    return contents;
}

function anonymizeFile(filename, contents) {
    if (filename.endsWith("_instances.json")) {
        // console.log(filename);
        return anonymizeAssessmentInstances(contents);
    } else if (filename.endsWith("_instance_questions.json")) {
        return anonymizeAssessmentInstances(contents);
    } else if (filename.endsWith("_access_rules.json")) {
        return anonymizeAssessmentInstances(contents);
    } else if (filename.endsWith("_submissions.json")) {
        return anonymizeAssessmentInstances(contents);
    } else if (filename.endsWith("_log.json")) {
        return anonymizeAssessmentInstances(contents);
    } else if (filename === "assessments.json") {
        return anonymizeAssessmentInstances(contents);
    } else if (filename === "gradebook.json") {
        return anonymizeAssessmentInstances(contents);
    } else if (filename === "download_log.txt") {
        return contents;
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
        let outstring;
        if (filename.endsWith(".json")) {
            data = JSON.parse(data);
            anonymizedContents = anonymizeFile(filename, data);
            outstring = JSON.stringify(anonymizedContents, null, 2);
        } else {
            outstring = anonymizeFile(filename, data);
        }

        // callback(); // skip actually writing the files while debugging
        fs.writeFile(outpath, outstring, err => {
            if (err) {
              console.error(err);
            }
            callback();
        });
    });

}

const files = fs.readdirSync(infolder); 

if (!fs.existsSync(outfolder)){
    fs.mkdirSync(outfolder);
}

async.mapLimit(files, 12, processFile);