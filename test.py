import subprocess
import sys

num_exams = sys.argv[1]
num_sds = sys.argv[2]
output_filename = '\'/Users/psud/PrairieLearn/' + sys.argv[3] + '\''
# tid = 'custom_quiz'
tid = '\'custom_quiz_balanced\''

output = subprocess.check_output(
    ['psql', '-d', 'postgres', '-f', 'code/sprocs/test.sql',
     '-v', 'num_exams=' + num_exams,
     '-v', 'num_sds=' + num_sds,
     '-v', 'output_filename=' + output_filename,
     '-v', 'tid=' + tid]
)

print(output)
# p1.wait()