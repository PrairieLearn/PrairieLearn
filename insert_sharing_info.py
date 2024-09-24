import csv
import json

# Reading the CSV file as a dictionary
with open("file.csv", mode="r") as file:
    csv_dict_reader = csv.DictReader(file)

    # Each row will be a dictionary with the headers as keys
    for row in csv_dict_reader:
        print(row)


json_string = '{"name": "John", "age": 30, "city": "New York"}'
data = json.loads(json_string)

print(data)


# Example dictionary to save as JSON
data = {
    "name": "John",
    "age": 30,
    "city": "New York",
    "hobbies": ["reading", "traveling", "coding"],
}

# Saving the dictionary as a formatted JSON file
with open("output.json", "w") as file:
    json.dump(data, file, indent="  ")  # Use '\t' to format with tabs

print("JSON saved with tabbed formatting.")
