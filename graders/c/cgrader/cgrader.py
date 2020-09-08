#! /usr/bin/python3

import os, json, subprocess, shlex, threading, re

CODEBASE = '/grade/student'
DATAFILE = '/grade/data/data.json'
SB_USER = 'sbuser'

class CGrader:

    def __init__(self):
        with open(DATAFILE) as file:
            self.data = json.load(file)

    def run_command(self, command, input=None, sandboxed=False):
        if isinstance(command, str):
            command = shlex.split(command)
        if sandboxed:
            command = ['su', SB_USER, '-s', '/bin/bash', '-c', shlex.join(['PATH=' + self.path] + command)]
        try:
            proc = subprocess.Popen(command,
                                    stdin=subprocess.PIPE,
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT,
                                    encoding='utf-8')
        except:
            return ''
        try:
            out, err = proc.communicate(input=input)
        finally:
            proc.kill()
            try:
                out, err = proc.communicate()
            finally:
                return '' if out is None else out

    def test_compile_file(self, c_file, exec_file, main_file=None, points=1):
        obj_file = re.sub('\.c$', '', c_file) + '.o'
        out = self.run_command(['gcc', '-c', c_file, '-o', obj_file])
        # TODO Separate main file
        if os.path.isfile(obj_file):
            if main_file:
                main_obj_file = re.sub('\.c$', '', main_file) + '.o'
                stripped_obj_file = 'nomain_' + obj_file
                out += self.run_command(['objcopy', '-N', 'main',
                                         obj_file, stripped_obj_file])
                out += self.run_command(['gcc', '-c', main_file,
                                         '-o', main_obj_file])
                out += self.run_command(['gcc', stripped_obj_file,
                                         main_obj_file,
                                         '-o', exec_file, '-lm'])
            else:
                out += self.run_command(['gcc', obj_file,
                                         '-o', exec_file, '-lm'])
        if os.path.isfile(exec_file):
            self.change_mode(exec_file, '755')
        self.add_test_result('Compilation',
                             points=os.path.isfile(exec_file),
                             output=out, max_points=points)

    def change_mode(self, file, mode='744'):
        file = os.path.abspath(file)
        self.run_command(['chmod', mode, file])
        parent = os.path.dirname(file)
        if parent and not os.path.samefile(file, parent):
            self.change_mode(parent, '711')

    def test_send_in_check_out(self, command, input, exp_output,
                               args=None, name=None, max_points=1):
        if args is not None and not isinstance(args, list): args = [args] 
        if name is None and input is not None:
            name = 'Test with input "%s"' % ' '.join(input.splitlines())
        if name is None and args is not None:
            name = 'Test with arguments "%s"' % ' '.join(args)
        out = self.run_command(command if args is None else ([command] + args), input, sandboxed=True)
        if not isinstance(exp_output, list): exp_output = [exp_output] 
        points = [t for t in exp_output if str(t) in out]
        self.add_test_result(name, points=points,
                             msg='Expected "%s"' % '" OR "'.join([str(t) for t in exp_output]),
                             output=out, max_points=max_points)
    
    def add_test_result(self, name, description='', points=True,
                        msg='', output='', max_points=1):
        if not isinstance(points, (int, float)):
            points = max_points if points else 0.0
        test = {
            'name': name, 'description': description,
            'points': points,
            'max_points': max_points,
            'output': output, 'message': msg
        }
        self.result['tests'].append(test)
        self.result['points'] += points
        self.result['max_points'] += max_points

    def save_results(self):
        if self.result['max_points'] > 0:
            self.result['score'] = self.result['points'] / \
                                   self.result['max_points']
        
        if not os.path.exists('/grade/results'):
            os.makedirs('/grade/results')
        with open('/grade/results/results.json', 'w') as resfile:
            json.dump(self.result, resfile)
    
    def start(self):
        
        self.result = {
            'score': 0.0,
            'points': 0,
            'max_points': 0,
            'output': '',
            'message': '',
            'gradable': True,
            'tests': []
        }
        
        os.chdir(CODEBASE)

        self.path = '/cgrader:' + os.environ['PATH']
        
        #self.run_command(['groupadd', SB_USER])
        #self.run_command(['useradd', '-g', SB_USER, SB_USER])
        self.run_command('chmod -R 700 /grade')

        # Create a fake "pause" command so students with 'system("PAUSE")' don't get an error
        with open('/cgrader/PAUSE', 'w') as f:
            f.write('#! /bin/sh\n')
        self.change_mode('/cgrader/PAUSE', '755')
        self.run_command(['ln', '-s', '/cgrader/PAUSE',
                          '/cgrader/pause'])
        self.run_command(['ln', '-s', '/cgrader/PAUSE',
                          '/cgrader/Pause'])

        self.tests()
        
        if self.result['gradable']:
            self.result['message'] = 'Tests completed'
        self.save_results()

    def tests(self):
        pass

CGrader().start()
