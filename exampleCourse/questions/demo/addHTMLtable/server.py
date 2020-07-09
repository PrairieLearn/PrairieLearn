import random
import io

def generate(data):

    name_list = ["Carla", "Manoel", "Sam", "Laura", "Amanda"]
    age_list =  [24, 18, 30, 45, 32]
    name_greek = ["$\\gamma$", "$\\mu$", "$\\sigma$", "$\\lambda$", "$\\alpha$" ]

    # Generate complete html string
    mytable = '<table style="width:30%"><tr><th> Name </th> <th> Age </th> <th> Id </th></tr>'
    for i in range(len(age_list)):
        mytable += '<tr><td>'+name_list[i]+'</td><td>'+str(age_list[i])+'</td><td>'+name_greek[i]+'</td><tr>'
    mytable += '</table>'
    data['params']['mytable'] = mytable

    # Generate only the table content
    mytable2 = '<tr><th> Name </th> <th> Age </th> <th> Id </th></tr>'
    for i in range(len(age_list)):
        mytable2 += '<tr><td>'+name_list[i]+'</td><td>'+str(age_list[i])+'</td><td>'+name_greek[i]+'</td><tr>'
    data['params']['mytable2'] = mytable2

    # Generate table from console output
    output = io.StringIO()
    for i in range(len(name_list)):
        print('%12s%12s' % (name_list[i], age_list[i]) , file=output)
    mytable3 = output.getvalue()
    output.close()
    data['params']['mytable3'] = mytable3
