import numpy as np

ingredients = ['sugar water', 'acid', 'co2', 'culture']

sw_to_acid = int(data['params']['sw_to_acid']) / 100
sw_to_culture = int(data['params']['sw_to_culture']) / 100
acid_to_co2 = int(data['params']['acid_to_co2']) / 100
acid_to_culture = int(data['params']['acid_to_culture']) / 100
co2_to_acid = int(data['params']['co2_to_acid']) / 100

initial_sw = int(data['params']['initial_sw']) / 100
initial_culture = int(data['params']['initial_culture']) / 100

M = np.array([
    [ 1.0 - (sw_to_acid + sw_to_culture), sw_to_acid, 0, sw_to_culture ], # Sugar water
    [ 0, 1.0 - (acid_to_co2 + acid_to_culture), acid_to_co2, acid_to_culture ], # Acid
    [ 0, co2_to_acid, 1.0 - co2_to_acid, 0 ], # CO2
    [ 0, 0, 0, 1 ] # Culture
    ]).T

composition = np.array([initial_sw, 0, 0, initial_culture])
hours = 0

percentage = data['params']['percent_composition'] / 100

while composition[0] > percentage:
    composition = M @ composition
    hours += 1
