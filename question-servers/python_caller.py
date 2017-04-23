
import sys, os, json

json_inp = sys.stdin.read()
inp = json.loads(json_inp)
question_dir = inp['question_dir']

sys.path[0] = question_dir

if os.path.isfile('server.py'):
    import server
    if inp['cmd'] == 'get_data':
        question_data = server.get_data()
        outp = {"question_data": question_data}
    else:
        raise Exception('Unknown cmd: ' + inp['cmd'])
    json_outp = json.dumps(outp)
    sys.stdout.write(json_outp)
