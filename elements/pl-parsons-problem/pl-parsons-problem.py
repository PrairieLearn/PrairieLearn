import prairielearn as pl
import lxml.html
import random
import base64
DEFAULT_CHECK_INDENTATION = False

def getAnswer(submitted, pieces):
    if submitted == '':
        return ''
    answer = ''
    for piece in submitted.split('-'):
        piece_no, indent = piece.split(':')
        indent = int(indent)
        piece_no = int(piece_no)
        answer = answer + ('    ' * indent) + pieces[piece_no] + '\n'
    return answer
# answers are submitted using the following form:    a:b-c:d-e:f
# where a, c, and e are indices into the list of pieces given by the problem, and
#       b, d, and f are the number of levels they are indented.
# This function checks that a submitted answer is formatted correct and converts it
# into the following format:  [(a, b), (c, d), (e, f)]

def unpack_answer(submitted, num_pieces, data, name):
    if submitted == '':
        return []
    unpacked = []
    for piece in submitted.split('-'):
        piece_no, indent = piece.split(':')
        try:
            if not 0 <= int(piece_no) < num_pieces:
                raise ValueError()
        except ValueError:
            data['format_errors'][name] = 'INVALID piece number: ' + piece_no
            return []
        try:
            if not 0 <= int(indent) <= 4:
                raise ValueError()
        except ValueError:
            data['format_errors'][name] = 'INVALID indentation: ' + str(indent)
            return []

        piece_tuple = (int(piece_no), int(indent))
        unpacked.append(piece_tuple)
    return unpacked

# this function takes an unpacked submission and checks it against the correct
# solution piece by piece.  Returns an overall score (all right or all wrong),
# textual feedback that could be provided to a learner, and flags for pieces
# up to the first error indicating that the piece is correct, incorrect, mis-indented, or missing
def grade_submitted(pieces, correct, unpacked_submitted, check_indentation):
    score = 1
    flags = []
    feedback = ''
    for idx, piece in enumerate(correct):
        if idx >= len(unpacked_submitted):
            score = 0
            flags.append('missing')
            feedback = 'solution code not long enough'
            break
        submitted_idx, submitted_indent = unpacked_submitted[idx]
        if piece.get('html', '') != pieces[submitted_idx]:
            score = 0
            flags.append('incorrect')
            feedback = 'wrong piece in position {} (counting from 1)'.format(idx+1)
            break
        if check_indentation and piece.get('indent', 0) != submitted_indent:
            score = 0
            flags.append('misaligned')
            feedback = 'wrong indentation in position {} (counting from 1)'.format(idx+1)
            break
        flags.append('correct')

    if len(correct) < len(unpacked_submitted):
        score = 0
        feedback = 'solution code too long'
        flags.append('incorrect')

    return score, feedback, flags


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name']
    optional_attribs = ['max-distractors', 'max-feedback-count', 'check-indentation', 'header-left-column', 'header-right-column','file-name']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers-name')

    # parse the sub-elements, making lists of both correct answers and distractors
    correct_answers = []
    distractors = [] 
    for child in element:
        child_html = pl.inner_html(child).strip()
        if child.tag == 'pl-answer':
            pl.check_attribs(child, required_attribs=[], optional_attribs=['indent'])
            indent = pl.get_integer_attrib(child, 'indent', -1)
            answer_tuple = {'html': child_html, 'indent': indent}
            correct_answers.append(answer_tuple)
        if child.tag == 'pl-distractor':
            pl.check_attribs(child, required_attribs=[], optional_attribs=[])
            answer_tuple = {'html': child_html}
            distractors.append(answer_tuple)

    # error check the input and 

    len_correct = len(correct_answers)
    if len_correct < 1:
        raise Exception('pl-parsons-problem element must have at least one answer element')

    # select the appropriate number of distractors, and make a shuffle list of things to display

    number_distractors = min(len(distractors), pl.get_integer_attrib(element, 'max-distractors', len(distractors)))
    sampled_distractors = random.sample(distractors, number_distractors)

    sampled_answers = correct_answers + sampled_distractors
    random.shuffle(sampled_answers)

    pieces = list(map(lambda x: x['html'], sampled_answers))

    # store stuff in 'data' 

    if name in data['params']:
        raise Exception('duplicate params variable name: %s' % name)
    if name in data['correct_answers']:
        raise Exception('duplicate correct_answers variable name: %s' % name)
    data['params'][name] = pieces
    data['correct_answers'][name] = correct_answers


def render_piece(id, indent, text, flag):
    return '<li id={} class="prettyprint lang-py indent{} {}">{}</li>'.format(id, indent, flag, text)

def decorate_submitted_with_flags(unpacked_submitted, flags):
    output = []
    for idx, piece in enumerate(unpacked_submitted):
        flag = '' if idx >= len(flags) else flags[idx]
        new_tuple = (piece[0], piece[1], flag)
        output.append(new_tuple)

    return output
       

def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    check_indentation = pl.get_boolean_attrib(element, 'check-indentation', DEFAULT_CHECK_INDENTATION)
    #change
    header_left = pl.get_string_attrib(element, 'header-left-column','Drag from here')
    header_right = pl.get_string_attrib(element, 'header-right-column', 'Construct your solution here')
    #change
    pieces = data['params'].get(name, [])
    if len(pieces) == 0:
        raise Exception("No pieces in Parson's problem")

    correct = data['correct_answers'].get(name, [])
    submitted_str = data['submitted_answers'].get(name, '')
    unpacked_submitted = unpack_answer(submitted_str, len(pieces), data, name)
    
    submitted = list(map(lambda x: x[0], unpacked_submitted))
    indents = {}
    for idx, indent in unpacked_submitted:
        indents[idx] = indent

    if data['panel'] == 'question':
        editable = data['editable']
        partial_score = data['partial_scores'].get(name, {'score': None})
        score = partial_score.get('score', None)
        flags = [] if score is None else grade_submitted(pieces, correct, unpacked_submitted, check_indentation)[2]
        decorated_submitted = decorate_submitted_with_flags(unpacked_submitted, flags)

        unused_items = ''.join([render_piece(id, 0, piece, '') for id, piece in enumerate(pieces) if id not in submitted])
        answer_items = ''.join([render_piece(id, indent, pieces[id], flag) for (id, indent, flag) in decorated_submitted])

        html =  '<div id="sortable-unused"  class="sortable-code">' 
        html += header_left
        html += '<ul id="ul-unused">' + unused_items + '</ul></div>' 
        html += '<div id="sortable-answer" class="sortable-code">' 
        html += header_right
        html += '<ul id="ul-answer">' + answer_items + '</ul></div>'
        html += '<input type="hidden" id="parsons-input" name="' + name + '" value="' + submitted_str + '">'

    elif data['panel'] == 'submission':
        # FIXME: handle parse errors?
        if submitted == '':
            html = 'No submitted answer'
        else:
            # partial_score = data['partial_scores'].get(name, {'score': None})
            # score = partial_score.get('score', None)
        
            html = '<pre>'
            for piece_idx, indent in unpacked_submitted:
                html += ('    ' * indent) + pieces[piece_idx] + '\n'
            html += '</pre>'
            feedback = grade_submitted(pieces, correct, unpacked_submitted, check_indentation)[1]
            if feedback:
                html += '<p>' + feedback + '<p>'

            # if score is not None:
            #     try:
            #         score = float(score)
            #         if score >= 1:
            #             html = html + '&nbsp;<span class="badge badge-success"><i class="fa fa-check" aria-hidden="true"></i> 100%</span>'
            #         elif score > 0:
            #             html = html + '&nbsp;<span class="badge badge-warning"><i class="fa fa-circle-o" aria-hidden="true"></i> {:d}%</span>'.format(math.floor(score * 100))
            #         else:
            #             html = html + '&nbsp;<span class="badge badge-danger"><i class="fa fa-times" aria-hidden="true"></i> 0%</span>'
            #     except Exception:
            #         raise ValueError('invalid score' + score)
    elif data['panel'] == 'answer':
        html = "Your submission is graded from top to bottom.  Pieces shown in green are in the correct position with the correct indentation.  Yellow pieces are in the right position but with the wrong indentation.  Red pieces are in the wrong position.  Grading stops as soon as you hit a red or yellow piece."

        # correct_answer = data['correct_answers'].get(name, None)
        # if correct_answer is None:
        #     html = 'ERROR: No true answer'
        # else:
        #     html = '<pre>'
        #     for piece in correct_answer:
        #         html += ('    ' * piece.get('indent', 0)) + piece.get('html', '') + '\n'
        #     html += '</pre>'

    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html



def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    #
    submitted = data['submitted_answers'].get(name, '')
    num_pieces = len(data['params'].get(name, []))
    pieces = data['params'].get(name, [])
    #change
    file_name = pl.get_string_attrib(element, 'file-name', None)# this should be pulled from an attribute
    if file_name != None:
        file_data = getAnswer(submitted, pieces)
        data['submitted_answers']['_files'] = [{
        'name': file_name,
        'contents': base64.b64encode(file_data.encode('utf-8')).decode('utf-8')
        }]
    #change 

    if num_pieces == 0:
        raise Exception('number of pieces is zero')
        
    if len(submitted) == 0:
        data['format_errors'][name] = 'No submitted answer.'
        return

    unpack_answer(submitted, num_pieces, data, name)        




def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', 1)
    check_indentation = pl.get_boolean_attrib(element, 'check-indentation', DEFAULT_CHECK_INDENTATION)
    
    pieces = data['params'].get(name, [])
    correct = data['correct_answers'].get(name, [])
    submitted_str = data['submitted_answers'].get(name, '')
    unpacked_submitted = unpack_answer(submitted_str, len(pieces), data, name)

    score, feedback, flags = grade_submitted(pieces, correct, unpacked_submitted, check_indentation)

    data['partial_scores'][name] = {'score': score, 'weight': weight}


def test(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    weight = pl.get_integer_attrib(element, 'weight', 1)

    correct_key = data['correct_answers'].get(name, {'key': None}).get('key', None)
    if correct_key is None:
        raise Exception('could not determine correct_key')
    number_answers = len(data['params'][name])
    all_keys = [chr(ord('a') + i) for i in range(number_answers)]
    incorrect_keys = list(set(all_keys) - set([correct_key]))

    result = random.choices(['correct', 'incorrect', 'invalid'], [5, 5, 1])[0]
    if result == 'correct':
        data['raw_submitted_answers'][name] = data['correct_answers'][name]['key']
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif result == 'incorrect':
        if len(incorrect_keys) > 0:
            data['raw_submitted_answers'][name] = random.choice(incorrect_keys)
            data['partial_scores'][name] = {'score': 0, 'weight': weight}
        else:
            # actually an invalid submission
            data['raw_submitted_answers'][name] = '0'
            data['format_errors'][name] = 'INVALID choice'
    elif result == 'invalid':
        data['raw_submitted_answers'][name] = '0'
        data['format_errors'][name] = 'INVALID choice'

        # FIXME: add more invalid choices
    else:
        raise Exception('invalid result: %s' % result)
