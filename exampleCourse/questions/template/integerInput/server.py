import random

def generate(data):

    # Create a list of possible angles in radians
    angles_radians = ["\\pi/2","\\pi/4", "\\pi/3", "\\pi/6"]
    angles_degrees = [90,45,60,30]

    # Select one of the entries of the list
    option = random.randint(0,len(angles_radians)-1)

    # Put the angle in radians into data['params']
    data['params']['angle_radians'] = angles_radians[option]

    # Put the correct answer into data['correct_answers']
    data['correct_answers']['angle_degrees'] = angles_degrees[option]
