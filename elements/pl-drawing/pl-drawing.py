import prairielearn as pl
import lxml.html
import lxml.etree
import chevron
import json
import warnings
from attributes import attributes as element_attributes
from element_gen import generate_element, drawing_defaults
from element_grade import grade_element, can_grade, set_grading_tol

# Used for giving user feedback on wrong answers
element_names = {'controlledLine': 'Controlled Line', 'vector': 'Force Vector', 'arc_vector': 'Moment', 'distTrianLoad': 'Distributed Triangular Load', 'point': 'Point'}

graded_elements = ['pl-controlled-line', 'pl-controlled-curved-line', 'pl-vector', 'pl-arc-vector', 'pl-distributed-load', 'pl-point', 'pl-double-headed-vector', 'pl-graph-line']

element_defaults = {
    'gradable': False,
    'answers-name': '',
    'draw-error-box': False,
    'grid-size': 20,
    'angle-tol': 10,
    'snap-to-grid': False,
    'width': 580,
    'height': 320,
    'show-tolerance-hint': True,
    'render-scale': 1.5,
    'disregard-extra-elements': False
}


def union_drawing_items(e1, e2):
    # Union two sets of drawing items, prioritizing e2 in cases of duplicates.

    if 'objects' in e1:
        obj1 = e1['objects']
    else:
        obj1 = []

    if 'objects' in e2:
        obj2 = e2['objects']
    else:
        obj2 = []

    if len(obj1) == 0:
        return e2
    if len(obj2) == 0:
        return e1

    new_ids = []
    for item in obj2:
        new_ids.append(item['id'])

    newobj = []
    for item in obj1:
        if not item['id'] in new_ids:
            newobj.append(item)
    for item in obj2:
        newobj.append(item)

    return {'objects': newobj}


def check_attributes_rec(element):
    # Recursively check attributes for a tree of elements

    name = element.tag
    if name in element_attributes:
        try:
            pl.check_attribs(element, required_attribs=[], optional_attribs=element_attributes[name].keys())
        except Exception as e:
            print('Error in', name, ':', e)
            raise e
        for child in element:
            check_attributes_rec(child)


def check_graded(element, graded=True):
    # Recursively check if all of an element's children are correctly graded/ungraded
    # Will throw an error if e.g. an ungraded element is put in pl-drawing-answer

    for child in element:
        if child.tag is lxml.etree.Comment or child.tag == 'pl-drawing-group':
            continue

        if child.tag not in graded_elements:
            raise Exception('Element ' + child.tag + ' should not be graded!  Put it inside pl-drawing-initial.')
        check_graded(child, graded)


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    check_attributes_rec(element)

    w_button = None

    prev = not pl.get_boolean_attrib(element, 'gradable', element_defaults['gradable'])

    # Some preparation for elements with grading componenet
    if not prev:
        name = pl.get_string_attrib(element, 'answers-name', None)
        if name is None:
            raise Exception('answers-name is required if gradable mode is enabled')

        n_id = 1
        n_init_elements = 0
        n_ans_elements = 0
        n_control_elements = 0

        for child in element:
            # Get all the objects in pl-drawing-answer
            if child.tag == 'pl-drawing-answer':
                check_graded(child)
                draw_error_box = pl.get_boolean_attrib(child, 'draw-error-box', element_defaults['draw-error-box'])
                ans, n_id = render_drawing_items(child, n_id)
                n_ans_elements += 1
            # Get all the objects in pl-drawing-initial
            if child.tag == 'pl-drawing-initial':
                init, n_id = render_drawing_items(child, n_id)
                n_init_elements += 1
            # Get the width of the vector defined in the pl-drawing-button for pl-vector
            if child.tag == 'pl-controls':
                n_control_elements += 1
                for groups in child:
                    if groups.tag == 'pl-controls-group':
                        for buttons in groups:
                            if buttons.tag == 'pl-drawing-button':
                                type_name = buttons.attrib.get('type', None)
                                if type_name == 'pl-arc-vector-CCW':
                                    type_name = 'pl-arc-vector'
                                elif type_name == 'pl-arc-vector-CW':
                                    type_name = 'pl-arc-vector'
                                type_attribs = element_attributes.get(type_name, {}).keys()
                                pl.check_attribs(buttons, required_attribs=['type'], optional_attribs=type_attribs)
                                if buttons.attrib['type'] == 'pl-vector':
                                    if 'width' in buttons.attrib:
                                        w_button = buttons.attrib['width']
                                    else:
                                        w_button = None

        if n_init_elements > 1:
            raise Exception('You should have only one pl-drawing-initial inside a pl-drawing.')
        if n_ans_elements > 1:
            raise Exception('You should have only one pl-drawing-answer inside a pl-drawing.')
        elif n_ans_elements == 0:
            raise Exception(
                'You do not have any pl-drawing-answer inside pl-drawing where gradable=True. You should either enter the pl-drawing-answer if you want to grade objects, or make gradable=False'
            )

        # Makes sure that all objects in pl-drawing-answer are graded
        # and all the objects in pl-drawing--initial are not graded

        for obj in ans['objects']:
            obj['graded'] = True
            obj['drawErrorBox'] = draw_error_box
            if 'objectDrawErrorBox' in obj:
                if obj['objectDrawErrorBox'] is not None:
                    obj['drawErrorBox'] = obj['objectDrawErrorBox']
            # Check to see if consistent width for pl-vector is used for correct answer
            # and submitted answers that are added using the buttons
            if obj['gradingName'] == 'vector':
                if (w_button is None and obj['width'] == drawing_defaults['force-width']) or obj['width'] == float(w_button):
                    continue
                else:
                    raise Exception('Width is not consistent! pl-vector in pl-drawing-answers needs to have the same width of pl-vector in pl-drawing-button.')

        # Combines all the objects in pl-drawing-answers and pl-drawing-initial
        # and saves in correct_answers
        if n_init_elements != 0:
            for obj in init['objects']:
                obj['graded'] = False
            data['correct_answers'][name] = union_drawing_items(init, ans)
        else:
            data['correct_answers'][name] = ans


def render_controls(template, elem):
    if elem.tag == 'pl-controls':
        markup = ''
        for el in elem:
            if el.tag is lxml.etree.Comment:
                continue
            markup += render_controls(template, el) + '<br>\n'
        return markup
    elif elem.tag == 'pl-drawing-button':
        type_name = elem.attrib.get('type', None)
        if type_name is not None:
            if type_name == 'pl-arc-vector-CCW':
                type_name = 'pl-arc-vector'
                elem.attrib['clockwise-direction'] = 'false'
            elif type_name == 'pl-arc-vector-CW':
                type_name = 'pl-arc-vector'
                elem.attrib['clockwise-direction'] = 'true'
            opts = generate_element(elem, type_name)
            if opts is not None:
                opts['selectable'] = True
                opts['evented'] = True
                opts['graded'] = True
                opts['placed_by_user'] = True
            return chevron.render(template, {'render_button': True, 'button_class': elem.attrib.get('type', ''), 'options': json.dumps(opts)}).strip()
    elif elem.tag == 'pl-controls-group':
        markup = '<p><strong>' + elem.attrib.get('label', '') + '</strong></p>\n<p>'
        for child in elem:
            if child.tag is lxml.etree.Comment:
                continue
            markup += render_controls(template, child) + '\n'
        markup += '</p>\n'
        return markup
    else:
        return 'unknown tag ' + elem.tag


def render_drawing_items(elem, curid=1, defaults={}):
    # Convert a set of drawing items defined as html elements into an array of
    # objects that can be sent to mechanicsObjects.js
    # Some helpers to get attributes from elements.  If there is no default argument passed in,
    # it is assumed that the attribute must be present or else an error will be raised.  If a
    # default is passed, the attribute is optional.

    objects = []
    for el in elem:
        if el.tag is lxml.etree.Comment:
            continue
        elif el.tag == 'pl-drawing-group':
            if pl.get_boolean_attrib(el, 'visible', True):
                curid += 1
                raw, _ = render_drawing_items(el, curid, {'groupid': curid})
                objs = raw['objects']
                curid += len(objs)
                objects.extend(objs)
        else:
            obj = generate_element(el, el.tag, defaults)
            if obj is not None:
                obj['id'] = curid
                objects.append(obj)
                curid += 1
            else:
                warnings.warn('No known tag type: ' + el.tag)

    return ({'objects': objects}, curid)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', '')
    preview_mode = not pl.get_boolean_attrib(element, 'gradable', element_defaults['gradable'])
    with open('pl-drawing.mustache') as f:
        template = f.read()

    btn_markup = ''
    init = {'objects': []}

    for el in element:
        if el.tag is lxml.etree.Comment:
            continue
        elif el.tag == 'pl-controls' and not preview_mode:
            btn_markup = render_controls(template, el)
        elif el.tag == 'pl-drawing-initial':
            init, _ = render_drawing_items(el)
            draw_error_box = pl.get_boolean_attrib(el, 'draw-error-box', element_defaults['draw-error-box'])

    for obj in init['objects']:
        obj['graded'] = False
        obj['drawErrorBox'] = draw_error_box
        if 'objectDrawErrorBox' in obj:
            if obj['objectDrawErrorBox'] is not None:
                obj['drawErrorBox'] = obj['objectDrawErrorBox']

    grid_size = pl.get_integer_attrib(element, 'grid-size', element_defaults['grid-size'])
    tol = pl.get_float_attrib(element, 'tol', grid_size / 2)
    angle_tol = pl.get_float_attrib(element, 'angle-tol', element_defaults['angle-tol'])
    tol_percent = round(tol / grid_size, 2) if grid_size != 0 else 1

    js_options = {
        'snap_to_grid': pl.get_boolean_attrib(element, 'snap-to-grid', element_defaults['snap-to-grid']),
        'grid_size': grid_size,
        'editable': (data['panel'] == 'question' and not preview_mode),
        'base_url': data['options']['base_url'],
        'client_files': '/pl/static/elements/pl-drawing/clientFilesElement/',
        'render_scale': pl.get_float_attrib(element, 'render-scale', element_defaults['render-scale']),
        'width': pl.get_string_attrib(element, 'width', element_defaults['width']),
        'height': pl.get_string_attrib(element, 'height', element_defaults['height'])
    }

    show_btn = data['panel'] == 'question' and not preview_mode

    if tol == grid_size / 2:
        message_default = 'The expected tolerance is 1/2 square grid for position and ' + str(angle_tol) + ' degrees for angle.'
    else:
        message_default = 'The expected tolerance is ' + str(tol_percent) + ' square grid for position and ' + str(angle_tol) + ' degrees for angle.'

    html_params = {
        'uuid': pl.get_uuid(),
        'width': pl.get_string_attrib(element, 'width', element_defaults['width']),
        'height': pl.get_string_attrib(element, 'height', element_defaults['height']),
        'options_json': json.dumps(js_options),
        'show_buttons': show_btn,
        'name': name,
        'render_element': True,
        'btn_markup': btn_markup,
        'show_tolerance': show_btn and pl.get_boolean_attrib(element, 'show-tolerance-hint', element_defaults['show-tolerance-hint']),
        'tolerance': pl.get_string_attrib(element, 'tolerance-hint', message_default),
    }

    if data['panel'] == 'answer' and pl.get_boolean_attrib(element, 'hide-answer-panel', True):
        return ''

    if preview_mode:
        html_params['input_answer'] = json.dumps(init)
    else:
        if data['panel'] == 'answer' and name in data['correct_answers']:
            html_params['input_answer'] = json.dumps(data['correct_answers'][name])
        else:
            sub = {'objects': []}
            if name in data['submitted_answers']:
                sub = data['submitted_answers'][name]
            items = union_drawing_items(init, sub)
            html_params['input_answer'] = json.dumps(items)

    # Grading feedback
    if data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params['parse_error'] = parse_error

    return chevron.render(template, html_params).strip()


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    preview_mode = not pl.get_boolean_attrib(element, 'gradable', element_defaults['gradable'])

    if preview_mode:
        return

    try:
        data['submitted_answers'][name] = json.loads(data['submitted_answers'][name])
        if 'objects' not in data['submitted_answers'][name]:
            data['format_errors'][name] = 'No submitted answer.'
            data['submitted_answers'][name] = {}
    except json.JSONDecodeError:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = {}


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    prev = not pl.get_boolean_attrib(element, 'gradable', element_defaults['gradable'])
    if prev:
        return

    grid_size = pl.get_integer_attrib(element, 'grid-size', element_defaults['grid-size'])
    tol = pl.get_float_attrib(element, 'tol', grid_size / 2)
    angtol = pl.get_float_attrib(element, 'angle-tol', element_defaults['angle-tol'])
    disregard_extra_elements = pl.get_boolean_attrib(element, 'disregard-extra-elements', element_defaults['disregard-extra-elements'])

    name = pl.get_string_attrib(element, 'answers-name', element_defaults['answers-name'])
    student = data['submitted_answers'][name]
    reference = data['correct_answers'][name]

    if not isinstance(student, dict):
        data['format_errors'][name] = 'No submitted answer.'
        return data

    if 'objects' not in student:
        data['format_errors'][name] = 'No submitted answer.'
        return data

    matches = {}  # If a reference object is matched to a student object
    num_correct = 0  # number correct
    num_total_ref = 0
    num_total_st = 0
    num_optional = 0

    # Ensure that each reference object matches one and only one
    # student object.  Ungraded elements are skipped.
    # num_total_ref is the total number of objects that are expected to be graded
    # this disregards optional objects and objects that don't have a grading function
    for ref_element in reference['objects']:
        if can_grade(ref_element['gradingName']) and ref_element['graded']:
            matches[ref_element['id']] = False
            if 'optional_grading' in ref_element and ref_element['optional_grading']:
                continue
            num_total_ref += 1

    set_grading_tol(tol, angtol)

    # Loop through and check everything
    for element in student['objects']:
        if 'gradingName' not in element or not can_grade(element['gradingName']) or 'graded' not in element or not element['graded']:
            continue
        # total number of objects inserted by students (using buttons)
        # this will disregard the initial objects placed by question authors
        num_total_st += 1

        for ref_element in reference['objects']:
            if not can_grade(ref_element['gradingName']) or not ref_element['graded'] or element['gradingName'] != ref_element['gradingName']:
                # Skip if the reference element is not gradable
                continue

            if not disregard_extra_elements and matches[ref_element['id']]:
                # Skip if this object has already been matched
                continue

            if grade_element(ref_element, element, element['gradingName']):
                if ('optional_grading' in ref_element and ref_element['optional_grading']) or (disregard_extra_elements and matches[ref_element['id']]):
                    # It's optional but correct, so the score should not be affected
                    # Or, it's a duplicate and we're okay with that.
                    num_optional += 1
                else:
                    # if correct but optional, it does not add on number of correct answers,
                    # but the object will not be considered as extra
                    num_correct += 1

                matches[ref_element['id']] = True
                break

    extra_not_optional = num_total_st - (num_optional + num_correct)

    if num_total_ref == 0:
        score = 1
    else:
        percent_correct = num_correct / num_total_ref
        if percent_correct == 1:
            # if all the expected objects are matched
            # penalize extra objects
            score = max(0, percent_correct - extra_not_optional / num_total_ref)
        else:
            score = percent_correct

    data['partial_scores'][name] = {'score': score, 'weight': 1, 'feedback': {'correct': (score == 1), 'missing': {}, 'matches': matches}}

    return data
