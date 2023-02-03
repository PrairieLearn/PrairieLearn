from distutils.log import error
from importlib.resources import path
import pandas as pd
import os, argparse

parser = argparse.ArgumentParser(description='Convert all downloaded jsons into CSV format.')
parser.add_argument('-i', '--input-path', required=True, help='path we will find the input jsons')
parser.add_argument('-o', '--output-path', required=True, help='path to store CSV into (will be created if necessary)')
args = parser.parse_args()

path_to_input = args.input_path
path_to_output = args.output_path

if path_to_input[-1] != '/':
    path_to_input += '/'

if path_to_output[-1] != '/':
    path_to_output += '/'

if not os.path.exists(path_to_input):
    raise OSError('Input path specified does not exist, please make sure you have downloaded the JSON files already.')

if not os.path.exists(path_to_output):
    os.mkdir(path_to_output)

for subdir, dirs, files in os.walk(path_to_input):
    for file in files:
        if (file[-8:] == "log.json"):
            df = pd.read_json(path_to_input + file)
            file_name = file[:-8]
            df.to_csv(path_to_output + file_name + 'log.csv')
            
            os.remove(path_to_input + file)
