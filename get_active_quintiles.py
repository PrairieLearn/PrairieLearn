import subprocess
import sys

num_exams = sys.argv[1]
num_sds = sys.argv[2]
output_filename = '\'/Users/psud/PrairieLearn/' + sys.argv[3] + '\''
tid = '\'custom_quiz\''

subprocess.check_call(
    ['psql', '-d', 'postgres', '-f', 'code/sprocs/for_notebook__get_active_quintiles.sql',
     '-v', 'output_filename=' + output_filename,
     '-v', 'num_exams=' + num_exams,
     '-v', 'num_sds=' + num_sds,
     '-v', 'tid=' + tid]
)

# p1.wait()