import random
import io


def generate(data):

    name_list = ["Carla", "Manoel", "Sam", "Laura", "Amanda"]
    age_list =  [24, 18, 30, 45, 32]
    name_greek_list = ["$\\gamma$", "$\\mu$", "$\\sigma$", "$\\lambda$", "$\\alpha$"]

    # Generate complete html string
    mytable = '<table style="width:30%"><tr><th> Name </th> <th> Age </th> <th> Id </th></tr>'
    for name, age, name_greek in zip(name_list, age_list, name_greek_list):
        mytable += f'<tr><td> {name} </td><td> {str(age)} </td><td> {name_greek} </td><tr>'
    mytable += '</table>'
    data['params']['mytable'] = mytable

    # Generate only the table content
    mytable2 = '<tr><th> Name </th> <th> Age </th> <th> Id </th></tr>'
    for name, age, name_greek in zip(name_list, age_list, name_greek_list):
        mytable2 += f'<tr><td> {name} </td><td> {str(age)} </td><td> {name_greek} </td><tr>'
    data['params']['mytable2'] = mytable2

    # Generate table from console output
    output = io.StringIO()
    for name, age in zip(name_list, age_list):
        print('%12s%12s' % (name, age), file=output)
    mytable3 = output.getvalue()
    output.close()
    data['params']['mytable3'] = mytable3
