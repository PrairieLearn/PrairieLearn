
# Download exam data
# run python3 cd_api_download.py with the -t -i -a -o arguments set to the appropriate values

# convert json files to csv files
# run python3 json_to_csv.py with the -i -o arguments

# Anonymizing 
# run python3 anonymizer.py with the -i -o arguments

# Result and Evidence
# run python3 main.py -d -w1 -w2 -w3 to generate result file



from students_map import CheatingDetection
import sys
import os
import argparse

TIME_EPSILON = 60

parser = argparse.ArgumentParser(description='Cheat Detecting')
parser.add_argument('-d', '--input-dir', required=True, help='directory of csv files to process')
parser.add_argument('-o', '--output-dir', required=True, help='directory to store result (a .csv file)')
parser.add_argument('-n', '--number-of-quetions', required=True, help='the total number of questions in this exam')
args = parser.parse_args()

input_dir = args.input_dir 
output_dir = args.output_dir
n_questions = args.number_of_quetions

# when inputs are files: todo

# when input is a dir
files = [input_dir + '/' + f for f in os.listdir(input_dir)]

cheating_detection = CheatingDetection(files, output_dir,
                        {"CHECK_TIME_time_epsilon": TIME_EPSILON,
                         "N_QUESTIONS": n_questions}
                        )
cheating_detection.process_data()
cheating_detection.evaluate()





