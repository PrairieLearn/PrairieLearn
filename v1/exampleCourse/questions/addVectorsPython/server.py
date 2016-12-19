#!/usr/bin/env python

import sys, json, random, math

sys.stderr.write('all debugging output needs to go to stderr, as stdout is used for communication\n')

def main():
    if len(sys.argv) != 2:
        raise Exception('Expected 2 argments, got %d' % len(sys.argv))
    json_inp = sys.stdin.read()
    inp = json.loads(json_inp)
    if sys.argv[1] == 'getData':
        outp = getData(inp['vid'], inp['options'], inp['questionDir'])
    elif sys.argv[1] == 'gradeAnswer':
        outp = gradeAnswer(inp['vid'], inp['params'], inp['trueAnswer'], inp['submittedAnswer'], inp['options'])
    else:
        raise Exception('Unknown command: %s' % sys.argv[1])
    json_outp = json.dumps(outp)
    sys.stdout.write(json_outp)

def getData(vid, options, questionDir):
    random.seed(vid)

    # question parameters
    ux = random.randint(5, 10)
    uy = random.randint(5, 10)
    vx = random.randint(5, 10)
    vy = random.randint(5, 10)
    params = {
        "ux": ux,
        "uy": uy,
        "vx": vx,
        "vy": vy,
    }

    # correct answer to the question
    wx = ux + vx
    wy = uy + vy
    trueAnswer = {
        "wx": wx,
        "wy": wy,
    }

    questionData = {
        "params": params,
        "trueAnswer": trueAnswer,
        "options": {},
    }
    return questionData

def gradeAnswer(vid, params, trueAnswer, submittedAnswer, options):
    submitted_wx = float(submittedAnswer['wx'])
    submitted_wy = float(submittedAnswer['wy'])

    abs_err = math.sqrt(math.pow(submitted_wx - trueAnswer['wx'], 2) + math.pow(submitted_wy - trueAnswer['wy'], 2))
    abs_val = math.sqrt(math.pow(trueAnswer['wx'], 2) + math.pow(trueAnswer['wy'], 2))
    rel_err = abs_err / abs_val

    score = 0.0
    if abs_err < 1e-8 or rel_err < 1e-2:
        score = 1.0
    feedback = {}

    grading = {
        'score': score,
        'feedback': feedback,
    }
    return grading

if __name__ == '__main__':
    main()
