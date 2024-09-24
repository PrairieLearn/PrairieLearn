import csv
import json

with open("./sharing_sets.csv", mode="r") as sharingSetsFile:
    csv_dict_reader = csv.DictReader(sharingSetsFile)

    with open("infoCourse.json", mode="r+") as infoCourseFile:
        infoCourse = json.loads(infoCourseFile.read())
        # print(infoCourse)
        if "sharingSets" not in infoCourse:
            infoCourse["sharingSets"] = []

        existingSets = set(ss["name"] for ss in infoCourse["sharingSets"])
        for row in csv_dict_reader:
            sharingSet = row["name"]
            if sharingSet not in existingSets:
                infoCourse["sharingSets"].append(
                    {"name": sharingSet, "description": ""}
                )

        infoCourseFile.seek(0)
        infoCourseFile.truncate()
        infoCourseFile.write(json.dumps(infoCourse, indent="  "))



# # Example dictionary to save as JSON
# data = {
#     "name": "John",
#     "age": 30,
#     "city": "New York",
#     "hobbies": ["reading", "traveling", "coding"],
# }

# # Saving the dictionary as a formatted JSON file
# with open("output.json", "w") as file:
#     json.dump(data, file, indent="  ")  # Use '\t' to format with tabs

# print("JSON saved with tabbed formatting.")
