
# How to use PrairieLearn to learn your students names

## Get their names

Download your course roster:
* Log in to your `my.` portal (e.g., my.ece.illinois.edu)
* Click on `View Roster`
* Check the box with the appropriate section
* Click `Export to Excel`

Convert your course roster to `csv` format:
* Open `rpt_all_students.xls` in Excel.
* Save as `csv` with filename `rpt_all_students.csv`

Convert your course roster to JSON format:
* Create a python script called `parse_names.py` with this content:
```
import csv
import json

students = []

with open('rpt_all_students.csv', newline='') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        preferred = row['Preferred Name']
        if not preferred:
            preferred = None
        students.append({
            'uin': row['UIN'],
            'last': row['Last Name'],
            'first': row['First Name'],
            'preferred': preferred,
        })

with open('students.json', 'w') as outfile:
    json.dump(students, outfile, indent=4, sort_keys=True)
```
* Run this script (e.g., call `python parse_names.py` in a macOS terminal) in the same directory that contains `rpt_all_students.csv`
* Copy the resulting file (`student_names.json`) into the directory `pl-YOURCOURSE/clientFilesCourse`

## Get their images

Download them:
* Open a new browser window in Chrome
* Open Developer Tools (`View -> Developer -> Developer Tools` in the menubar)
* Click on `Network` in the Developer Tools part of the window
* Log in to your `my.` portal (e.g., my.ece.illinois.edu)
* Click on `View Roster`
* Check the box with the appropriate section
* Click on `View Photos`
* Right-click anywhere in the `Network` panel, select `Save as HAR with content`, and save the resulting file as `dump.har`

Parse them:
* Create a javascript file called `parse_images.js` with this content:
```
const fs = require('fs');
const file = JSON.parse(fs.readFileSync('./dump.har')).log;
const targetMimeType = 'image/jpeg';

let count = 1;
for (const entry of file.entries) {
    if (entry.response.content.mimeType === targetMimeType) {
        // Get UIN with RegEx search and "capture groups" (https://stackoverflow.com/questions/432493/how-do-you-access-the-matched-groups-in-a-javascript-regular-expression)
        let uin = entry.request.url.match(/uin=(.*)/)[1];
        fs.writeFileSync(`students/${uin}.png`, Buffer.from(entry.response.content.text, 'base64'), 'binary');
        count++;
    }
}
console.log(`Parsed ${count-1} images`);
```
* Put `parse_images.js` in the same directory as `dump.har`
* Create a new directory called `students` in the directory with `parse_images.js` and `dump.har`
* Install [node.js](https://nodejs.org/en/)
* Run these commands (e.g., from a macOS terminal) in in the directory with `parse_images.js` and `dump.har`:
```
npm init // hit return a bunch of times to get all the defaults
npm install moment --save
node parse_images.js
```
* Copy `student_images` into the directory `pl-YOURCOURSE/clientFilesCourse`

## Create questions and an assessment

Do the following things:
* Copy the questions `exampleCourse/questions/whichFace` and `exampleCourse/questions/whichName` into your course (creating new uuids as usual).
* Copy the assessment `exampleCourse/courseInstances/Sp18/assessments/learn_names` into your course (creating new uuids as usual).

You'll want to make sure that the student names and images are available neither to the public nor to other students. One way to do this would be to never push the new questions or new assessment to the remote server. Another way would be to use the access rule that appears in the example `infoAssessment.json`:
```
    "allowAccess": [
        {
            "role": "Instructor",
            "credit": 100
        }
    ],
```
This allows access to `learn_names` assessment only to instructors.

## Learn some names!

Keep at it. Never give up.
