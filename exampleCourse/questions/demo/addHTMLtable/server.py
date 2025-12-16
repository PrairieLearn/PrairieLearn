import io

import pandas as pd
import prairielearn as pl


def generate(data):
    name_list = ["Carla", "Manoel", "Sam", "Laura", "Amanda"]
    age_list = [24, 18, 30, 45, 32]
    name_greek_list = ["$\\gamma$", "$\\mu$", "$\\sigma$", "$\\lambda$", "$\\alpha$"]

    # Generate content for rendering in mustache
    data["params"]["table_data"] = [
        {"name": name, "age": age, "id": name_greek}
        for name, age, name_greek in zip(
            name_list, age_list, name_greek_list, strict=True
        )
    ]

    # Generate complete html string
    mytable = '<table style="width:30%"><thead><tr><th> Name </th> <th> Age </th> <th> Id </th></tr></thead><tbody>'
    for name, age, name_greek in zip(name_list, age_list, name_greek_list, strict=True):
        mytable += f"<tr><td> {name} </td><td> {age} </td><td> {name_greek} </td></tr>"
    mytable += "</tbody></table>"
    data["params"]["mytable"] = mytable

    # Generate only the table content
    mytable2 = (
        "<thead><tr><th> Name </th> <th> Age </th> <th> Id </th></tr></thead><tbody>"
    )
    for name, age, name_greek in zip(name_list, age_list, name_greek_list, strict=True):
        mytable2 += f"<tr><td> {name} </td><td> {age} </td><td> {name_greek} </td></tr>"
    mytable2 += "</tbody>"
    data["params"]["mytable2"] = mytable2

    # Generate table from console output
    output = io.StringIO()
    for name, age in zip(name_list, age_list, strict=True):
        print(f"{name:>12}{age:>12}", file=output)
    mytable3 = output.getvalue()
    output.close()
    data["params"]["mytable3"] = mytable3

    dataframe = pd.DataFrame(data["params"]["table_data"])
    data["params"]["dataframe"] = pl.to_json(dataframe)
