import json


def generate(data):
    # Reference coordinate system position and angle
    # Using a rotated coordinate system to test the fix
    data["params"]["ref_x"] = 200
    data["params"]["ref_y"] = 200
    data["params"]["ref_angle"] = 330  # Rotated to test the fix


def grade(data):
    # Parse the submitted answer to extract coordinate values
    coords_json = data["submitted_answers"].get("coords", "[]")

    try:
        coords_list = json.loads(coords_json)
    except json.JSONDecodeError:
        coords_list = []

    # Find the pl-coordinates element placed by the user
    user_coords = None
    for obj in coords_list:
        if obj.get("type") == "pl-coordinates" and obj.get("placed_by_user"):
            user_coords = obj
            break

    if user_coords:
        left = user_coords.get("left", 0)
        top = user_coords.get("top", 0)
        angle = user_coords.get("angle", 0)

        ref_x = data["params"]["ref_x"]
        ref_y = data["params"]["ref_y"]

        error_x = abs(left - ref_x)
        error_y = abs(top - ref_y)

        data["feedback"]["parsed_coords"] = {
            "left": round(left, 2),
            "top": round(top, 2),
            "angle": round(angle, 2),
        }
        data["feedback"]["error_x"] = round(error_x, 2)
        data["feedback"]["error_y"] = round(error_y, 2)
        data["feedback"]["position_ok"] = error_x <= 5 and error_y <= 5

    # Always give full score since this is just a test question
    data["score"] = 1.0
