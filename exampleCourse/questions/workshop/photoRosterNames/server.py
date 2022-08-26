import random
import json
import time
import os

def generate(data):

    rosterFile = data["options"]["server_files_course_path"] + '/roster.json'

    try:
        f = open(rosterFile)
    except:
        roster = [
            {"name": "Sorry!", "avatar_url": "<pl-figure file-name=\"sorry.jpg\"></pl-figure>"},
            {"name": "Carcassonne Meeples", "avatar_url": "<pl-figure file-name=\"meeple.png\"></pl-figure>"},
            {"name": "Chess", "avatar_url": "<pl-figure file-name=\"chess.png\"></pl-figure>"},
            {"name": "Monopoly", "avatar_url": "<pl-figure file-name=\"monopoly.png\"></pl-figure>"},
        ]
        data["params"]["gamehint"] = "<em>Click to learn how to configure for your own roster, not game pieces</em>"
        imgstr = "{0}"
        data["params"]["rosterModified"] = "N/A"
    else:
        roster = json.load(f)
        f.close()
        data["params"]["rosterModified"] = time.strftime('%Y-%m-%d %H:%M:%S UTC', 
            time.localtime(os.path.getmtime(rosterFile)))
        imgstr = "<img src=\"{0}\">"
        data["params"]["gamehint"] = ""


    person = random.sample(roster, k=4)
    data["params"]["rosterLength"] = len(roster)

    data["params"]["anstype"] = random.choice(['name', 'photo', 'matching'])

    if (data["params"]["anstype"] == "name"):
        data["params"]["question_prompt"] = "Who is this?<p>" + imgstr.format(person[0]["avatar_url"])

        data["params"]["correct"] = person[0]["name"]
        data["params"]["wrong1"] = person[1]["name"]
        data["params"]["wrong2"] = person[2]["name"]
        data["params"]["wrong3"] = person[3]["name"]

        data["params"]["multiplechoice"] = True

    elif (data["params"]["anstype"] == "matching"):

        data["params"]["matching"] = True
        data["params"]["name1"] = person[0]["name"]
        data["params"]["photo1"] = imgstr.format(person[0]["avatar_url"])
        data["params"]["name2"] = person[1]["name"]
        data["params"]["photo2"] = imgstr.format(person[1]["avatar_url"])
        data["params"]["name3"] = person[2]["name"]
        data["params"]["photo3"] = imgstr.format(person[2]["avatar_url"])
        data["params"]["name4"] = person[3]["name"]
        data["params"]["photo4"] = imgstr.format(person[3]["avatar_url"])

    else:
        data["params"]["multiplechoice"] = True

        data["params"]["question_prompt"] = "Which picture represents " + person[0]["name"] + "?"

        data["params"]["correct"] = imgstr.format(person[0]["avatar_url"])
        data["params"]["wrong1"] = imgstr.format(person[1]["avatar_url"])
        data["params"]["wrong2"] = imgstr.format(person[2]["avatar_url"])
        data["params"]["wrong3"] = imgstr.format(person[3]["avatar_url"])
