import subprocess
import sys

output_filename = '\'/Users/psud/PrairieLearn/' + sys.argv[1] + '\''
# tid = 'custom_quiz'
tid = '\'custom_quiz\''

subprocess.check_call(
    ['psql', '-d', 'postgres', '-f', 'code/sprocs/for_notebook__get_relevant_question_scores.sql',
     '-v', 'output_filename=' + output_filename,
     '-v', 'tid=' + tid]
)

# p1.wait()