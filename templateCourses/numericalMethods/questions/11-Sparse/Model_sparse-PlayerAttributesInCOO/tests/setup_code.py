from csv import reader
from random import choices, randrange

with open("PlayerAttributeData.csv") as f:
    csv_file = reader(f, delimiter=",")
    # Extract the list of attributes from header of CSV
    all_attributes = next(csv_file)

    # randomly select some attributes for each player
    player_attributes = [
        {
            all_attributes[i]: eval(values[i])
            for i in choices(range(len(all_attributes)), k=randrange(3, 7))
        }
        for values in csv_file
    ]
