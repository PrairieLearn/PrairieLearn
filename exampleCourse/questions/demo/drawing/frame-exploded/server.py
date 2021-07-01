import random
import math
import numpy as np

def generate(data):
        x= data['params']
        x['x1']= 30
        x['x2']= x['x1'] + 50*2
        x['x3']= x['x2'] + 35*2
        x['x4']= x['x3'] + 35*2
        x['y1']= 50
        x['y2']= x['y1'] + 40*2
        x['y3']= x['y2'] + 30*2
        x['y4']= x['y3'] + 40*2
        x['width_start_canvas']= 1.5*x['x4']
        x['width_canvas']= 2.5*x['x4']
        x['height_canvas']= 1.5*x['y4']
        x['theta1']= 180/math.pi * math.atan2(x['y2']-x['y3'], x['x3']-x['x2'])
        x['neg_theta1']= 180 + x['theta1']
        x['theta2']= 180/math.pi * math.atan2(x['y1']-x['y4'], x['x2']-x['x1'])
        x['neg_theta2']= 180 + x['theta2']
        x['width_arrow']= 48
        x['arrowhead_width']= 0.8
        x['arrowhead_length']= 0.8

        x['x5']= x['x4'] + 75
        x['x6']= x['x5'] + 120
        x['x7']= x['x6'] + 40
        x['x8']= x['x7'] + x['x3'] - x['x2']
        x['x9']= x['x6'] + x['x4'] - x['x2']
        x['x10']= x['x6'] + x['x3'] - x['x2']

        x['y5']= x['y2'] + 100
        x['y6']= x['y5'] + x['y3'] - x['y2']
        x['y7']= 0.5 * (x['y1'] + x['y2'])

        return data
