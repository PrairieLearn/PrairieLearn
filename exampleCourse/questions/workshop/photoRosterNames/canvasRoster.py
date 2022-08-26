import os
import sys
import requests
import json

try:
    from dotenv import load_dotenv
except ImportError:
    print("dotenv library not found, you will need to populate your environment variables manually", file=sys.stderr)
else:
    load_dotenv()

CANVAS_HOSTNAME="canvas.instructure.com"
PER_PAGE=1000

try:
    os.environ["CANVAS_TOKEN"]
except:
    print("\nHelper script did not find the CANVAS_TOKEN environment variable with your token.", file=sys.stderr)
    print("That's necessary to continue. Set the environment variable or use the .env file", file=sys.stderr)
    print("See the question More info button for additional instructions\n", file=sys.stderr)
    sys.exit(1)


headers = {'Authorization': 'Bearer ' + os.environ["CANVAS_TOKEN"]}

if len(sys.argv) == 2:

    print("Getting roster, redirect this to a file to save (or copy/paste)", file=sys.stderr)

    response = requests.get("https://{0}/api/v1/courses/{1}/search_users?include[]=avatar_url&enrollment_type=student&per_page={2}".format(CANVAS_HOSTNAME, sys.argv[1], PER_PAGE), headers=headers)

    print(json.dumps(response.json(), indent=4))

else:

    response = requests.get("https://canvas.instructure.com/api/v1/courses?enrollment_type=teacher&exclude_blueprint_courses=true&enrollment_state=active", headers=headers)

    print(" course_id\t    //   course_name\t\t\t\t // sis_course_id")
    for course in response.json():
        print(course["id"], " // ", course.get("name"), " // ", course.get("sis_course_id"))

    print("\n Run the script again with the course_id as an argument to get the roster")
