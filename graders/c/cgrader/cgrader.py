#! /usr/bin/python3

import os, json, subprocess, shlex, threading, re, sys

CODEBASE = '/grade/student'
DATAFILE = '/grade/data/data.json'
SB_USER = 'sbuser'

TIMEOUT_MESSAGE = \
    '\n\nTIMEOUT! Typically this means the program took too long,' + \
    '\nrequested more inputs than provided, or an infinite loop was found.' + \
    '\nIf your program is reading data using scanf inside a loop, this ' + \
    '\ncould also mean that scanf does not support the input provided ' + \
    '\n(e.g., reading an int if the input is a double).\n'

class UngradableException(Exception):
    def __init__(self):
        pass

class CGrader:

    def __init__(self):
        with open(DATAFILE) as file:
            self.data = json.load(file)

    def run_command(self, command, input=None, sandboxed=True, timeout=None):
        if isinstance(command, str):
            command = shlex.split(command)
        if sandboxed:
            command = ['su', SB_USER, '-s', '/bin/bash', '-c',
                       shlex.join(['PATH=' + self.path] + command)]

        try:
            proc = subprocess.Popen(command,
                                    stdin=subprocess.PIPE,
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT)
        except:
            return ''
        out1 = out2 = None
        tostr = ''
        if input is not None and not isinstance(input, (bytes, bytearray)):
            input = str(input).encode('utf-8')
        try:
            out1 = proc.communicate(input=input, timeout=timeout)[0]
        except subprocess.TimeoutExpired:
            tostr = TIMEOUT_MESSAGE
        finally:
            proc.kill()
            try:
                out2 = proc.communicate(timeout=timeout)[0]
            except subprocess.TimeoutExpired:
                tostr = TIMEOUT_MESSAGE
            finally:
                out = ''
                if out1:
                    out += out1.decode('utf-8', 'backslashreplace')
                if out2:
                    out += out2.decode('utf-8', 'backslashreplace')
                return out + tostr

    def test_compile_file(self, c_file, exec_file, main_file=None, add_c_file=None,
                          points=1, field=None, flags=None, name='Compilation',
                          add_warning_result_msg=True,
                          ungradable_if_failed=True):

        if flags and not isinstance(flags, list):
            flags = shlex.split(flags)
        elif not flags:
            flags = []
        
        obj_file = re.sub('\.c$', '', c_file) + '.o'
        out = self.run_command(['gcc', '-c', c_file, '-o', obj_file] + flags, sandboxed=False)
        if os.path.isfile(obj_file):

            objs = []
            
            if add_c_file:
                # Add new C file that maybe overwrites some existing functions.
                add_obj_file = re.sub('\.c$', '', add_c_file) + '.o'
                out += self.run_command(['gcc', '-c', add_c_file,
                                         '-o', add_obj_file] + flags, sandboxed=False)
                objs.append(add_obj_file)
                flags.append('-Wl,--allow-multiple-definition')

            if main_file:
                main_obj_file = re.sub('\.c$', '', main_file) + '.o'
                out += self.run_command(['strip', '-N', 'main', obj_file], sandboxed=False)
                out += self.run_command(['gcc', '-c', main_file,
                                         '-o', main_obj_file] + flags, sandboxed=False)
                objs.append(main_obj_file)
                flags.append('-Wl,--allow-multiple-definition')

            # The main C file must be the last so its functions can be
            # overwritten
            objs.append(obj_file)
            
            out += self.run_command(['gcc'] + objs +
                                    ['-o', exec_file, '-lm'] + flags, sandboxed=False)
        
        if os.path.isfile(exec_file):
            self.change_mode(exec_file, '755')
        elif ungradable_if_failed:
            self.result['message'] += f'Compilation errors, please fix and try again.\n\n{out}\n'
            raise UngradableException()
        if out and add_warning_result_msg:
            self.result['message'] += f'Compilation warnings:\n\n{out}\n'
        return self.add_test_result(name, output=out,
                                    points=os.path.isfile(exec_file),
                                    max_points=points, field=field)

    def change_mode(self, file, mode='744'):
        file = os.path.abspath(file)
        self.run_command(['chmod', mode, file], sandboxed=False)
        parent = os.path.dirname(file)
        if parent and not os.path.samefile(file, parent):
            self.change_mode(parent, '711')
    
    def test_send_in_check_out(self, *args, **kwargs):
        '''Old deprecated function name,
        retained for compatibility reasons.'''
        return self.test_run(*args, **kwargs)
        
    def test_run(self, command, input=None, exp_output=None,
                 must_match_all_outputs=False,
                 reject_output=None, field=None,
                 ignore_case=True, timeout=1, size_limit=10240,
                 ignore_consec_spaces=True,
                 args=None, name=None, msg=None, max_points=1):
        
        if args is not None and not isinstance(args, list): args = [args] 
        
        if name is None and input is not None:
            name = 'Test with input "%s"' % ' '.join(input.splitlines())
        elif name is None and args is not None:
            name = 'Test with arguments "%s"' % ' '.join(args)
        elif name is None and isinstance(command, list):
            name = 'Test command: %s' % command[0]
        elif name is None:
            name = 'Test command: %s' % command
        
        if exp_output is not None and not isinstance(exp_output, list):
            exp_output = [exp_output] 
        if reject_output is not None and not isinstance(reject_output, list):
            reject_output = [reject_output]
        if msg is None and exp_output is not None:
            msg = 'Expected: %s' % (' AND ' if must_match_all_outputs \
                                     else ' OR ').join([f'\n{t}\n' if '\n' in str(t) else f'"{t}"' for t in exp_output]) + \
                  (' but not "%s"' % '"/"'.join([str(t) for t in reject_output]) if reject_output else '')
        elif msg is None:
            msg = ''

        out = self.run_command(command if args is None else ([command] + args),
                               input, sandboxed=True, timeout=timeout)
        outcmp = out
        if not out.endswith('\n'): out += '\n(NO ENDING LINE BREAK)'

        if ignore_case:
            outcmp = outcmp.lower()
            if exp_output:
                exp_output = [str(t).lower() for t in exp_output]
            if reject_output:
                reject_output = [str(t).lower() for t in reject_output]

        if ignore_consec_spaces:
            # Replace all space-like characters with single space
            outcmp = re.sub(r'\s+', ' ', outcmp)
            if exp_output:
                exp_output = [re.sub(r'\s+', ' ', str(t)) for t in exp_output]
            if reject_output:
                reject_output = [re.sub(r'\s+', ' ', str(t)) for t in reject_output]

        points = True
        if timeout and 'TIMEOUT' in out:
            points = False
        elif size_limit and len(out) > size_limit:
            out = out[0:size_limit] + '\nTRUNCATED: Output too long.'
            points = False
        elif exp_output is not None and must_match_all_outputs \
           and [t for t in exp_output if str(t) not in outcmp]:
            points = False
        elif exp_output is not None and not must_match_all_outputs \
           and not [t for t in exp_output if str(t) in outcmp]:
            points = False
        elif reject_output is not None \
           and [t for t in reject_output if str(t) in outcmp]:
            points = False

        return self.add_test_result(name, points=points, msg=msg,
                                    output=out, max_points=max_points,
                                    field=field)

    def add_manual_grading(self, points=1, name=None, description=None):
        if not name:
            name = 'Manual Grading - to be reviewed by a human grader'
        if not description:
            description = 'This code will be manually reviewed by a human grader. The points associated to this component will be added based on evaluation of code style, programming practices and other manully checked criteria.'
        return self.add_test_result(name, description, points=0,
                                    max_points=points)
    
    def add_test_result(self, name, description='', points=True,
                        msg='', output='', max_points=1, field=None,
                        images=None):
        if not isinstance(points, (int, float)):
            points = max_points if points else 0.0
        test = {
            'name': name, 'description': description,
            'points': points,
            'max_points': max_points,
            'output': output, 'message': msg if msg else ''
        }
        if images and isinstance(images, list):
            test['images'] = images
        elif images:
            test['images'] = [images]
        self.result['tests'].append(test)
        self.result['points'] += points
        self.result['max_points'] += max_points
        if field is not None:
            if 'partial_scores' not in self.result:
                self.result['partial_scores'] = {}
            if field not in self.result['partial_scores']:
                self.result['partial_scores'][field] = {
                    'points': points,
                    'max_points': max_points}
            else:
                self.result['partial_scores'][field]['points'] += points
                self.result['partial_scores'][field]['max_points'] += max_points
        return test
                

    def save_results(self):
        if self.result['max_points'] > 0:
            self.result['score'] = self.result['points'] / \
                                   self.result['max_points']
        if 'partial_scores' in self.result:
            for field, ps in self.result['partial_scores'].items():
                ps['score'] = ps['points'] / ps['max_points']
        
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
        
        self.run_command('chmod -R 700 /grade', sandboxed=False)

        # Create a fake "pause" command so students with 'system("PAUSE")' don't get an error
        with open('/cgrader/PAUSE', 'w') as f:
            f.write('#! /bin/sh\n')
        self.change_mode('/cgrader/PAUSE', '755')
        self.run_command(['ln', '-s', '/cgrader/PAUSE',
                          '/cgrader/pause'], sandboxed=False)
        self.run_command(['ln', '-s', '/cgrader/PAUSE',
                          '/cgrader/Pause'], sandboxed=False)

        try:
            self.tests()
        except UngradableException:
            self.result['gradable'] = False
        finally:
            self.save_results()

    def tests(self):
        pass

CGrader().start()
