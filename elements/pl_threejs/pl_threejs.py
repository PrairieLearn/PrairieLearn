import prairielearn as pl
import lxml.html
import chevron
import numpy as np
import json
import base64
import os
import pyquaternion
import math


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = [
        'answer_name',          # key for 'submitted_answers' and 'true_answers'
        'file_name'             # *.stl
    ]
    optional_attribs = [
        'file_directory',       # 'clientFilesCourse' or 'clientFilesQuestion'
        'body_color',           # '#e84a27' (default)
        'body_orientation',     # [x, y, z, w] or [roll, pitch, yaw] or rotation matrix (3x3 ndarray) or exponential coordinates [wx, wy, wz]
        'body_scale',           # s (float > 0)
        'camera_position',      # [x, y, z] - camera is z up and points at origin of space frame
        'body_canmove',         # true (default) or false
        'camera_canmove',       # true (default) or false
        'format_of_body_orientation',       # 'rpy' (default), 'quaternion', 'matrix', 'axisangle'
        'format_of_display_orientation',    # 'matrix' (default), 'quaternion'
        'format_of_answer_orientation',     # 'rpy' (default), 'quaternion', 'matrix', 'axisangle'
        'show_display',         # true (default) or false
        'tol_degrees',          # 5 (default : float > 0)
        'grade'                 # true (default) or false
    ]
    pl.check_attribs(element, required_attribs=required_attribs, optional_attribs=optional_attribs)


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answer_name')

    if data['panel'] == 'question':
        uuid = pl.get_uuid()

        # Attributes
        file_url = get_file_url(element, data)    # uses file_name and file_directory
        body_color = pl.get_color_attrib(element, 'body_color', '#e84a27')
        body_orientation = get_body_orientation(element)
        body_scale = pl.get_float_attrib(element, 'body_scale', 1.0)
        camera_position = get_camera_position(element)
        body_canmove = pl.get_boolean_attrib(element, 'body_canmove', True)
        camera_canmove = pl.get_boolean_attrib(element, 'camera_canmove', True)
        format_of_display_orientation = pl.get_string_attrib(element, 'format_of_display_orientation', 'matrix')
        if format_of_display_orientation not in ['matrix', 'quaternion']:
            raise Exception('attribute "format_of_display_orientation" must be either "matrix" or "quaternion"')
        show_display = pl.get_boolean_attrib(element, 'show_display', True)
        
        # Restore pose of body and camera, if available - otherwise use values
        # from attributes (note that restored pose will also have camera_orientation,
        # which we currently ignore because the camera is always z up and looking
        # at the origin of the space frame).
        pose_default = {
            'body_quaternion': body_orientation,
            'body_position': [0, 0, 0],
            'camera_position': camera_position
        }
        pose = data['submitted_answers'].get(answer_name, pose_default)

        # These are passed as arguments to PLThreeJS constructor in client code
        options = {
            'uuid': uuid,
            'file_url': file_url,
            'state': dict_to_b64(pose),
            'scale': body_scale,
            'body_canmove': body_canmove,
            'camera_canmove': camera_canmove,
            'format_of_display_orientation': format_of_display_orientation,
            'body_color': body_color,
            'show_display': show_display
        }

        # These are used for templating
        html_params = {
            'question': True,
            'uuid': uuid,
            'answer_name': answer_name,
            'show_bodybuttons': body_canmove,
            'show_toggle': body_canmove and camera_canmove,
            'show_display': show_display,
            'default_is_python': True,
            'options': json.dumps(options)
        }

        with open('pl_threejs.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'submission':
        will_be_graded = pl.get_boolean_attrib(element, 'grade', True)
        if not will_be_graded:
            return ''

        # Get submitted answer
        q = data['submitted_answers'][answer_name]['body_quaternion']
        q = np.array(q, dtype=np.float64)

        # Convert submitted answer to Quaternion
        q = pyquaternion.Quaternion(np.roll(q, 1))

        # Convert Quaternion to disp_params
        f = pl.get_string_attrib(element, 'format_of_display_orientation', 'matrix')
        disp_params = convert_quaternion_to_display(f, q)

        # Create html_params and merge disp_params
        html_params = {
            'answer': True,
            'uuid': pl.get_uuid(),
            'default_is_python': True
        }
        html_params = {**html_params, **disp_params}

        partial_score = data['partial_scores'].get(answer_name, None)
        if partial_score is not None:
            html_params['angle'] = str(np.abs(np.round(partial_score['feedback'], 1)))
            html_params['show_footer'] = True
            score = partial_score.get('score', None)
            if score is not None:
                try:
                    score = float(score)
                    if score >= 1:
                        html_params['correct'] = True
                    elif score > 0:
                        html_params['partial'] = math.floor(score * 100)
                    else:
                        html_params['incorrect'] = True
                except:
                    raise ValueError('invalid score' + score)

        with open('pl_threejs.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        will_be_graded = pl.get_boolean_attrib(element, 'grade', True)
        if not will_be_graded:
            return ''

        # Get correct answer
        a = data['correct_answers'].get(answer_name, None)
        if a is None:
            return ''

        # Convert correct answer to Quaternion
        f = pl.get_string_attrib(element, 'format_of_answer_orientation', 'rpy')
        q = convert_correct_answer_to_quaternion(f, a)

        # Convert Quaternion to disp_params
        f = pl.get_string_attrib(element, 'format_of_display_orientation', 'matrix')
        disp_params = convert_quaternion_to_display(f, q)

        # Create html_params and merge disp_params
        html_params = {
            'answer': True,
            'uuid': pl.get_uuid(),
            'default_is_python': True
        }
        html_params = {**html_params, **disp_params}

        with open('pl_threejs.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def convert_quaternion_to_display(f, q, digits=4):
    if f == 'matrix':
        R = q.rotation_matrix
        matlab_data = pl.numpy_to_matlab(R, ndigits=digits)
        python_data = str(R.round(digits).tolist())
        data_format = 'rotation matrix'
        data_label = 'R'
    elif f == 'quaternion':
        q = np.roll(q.elements, -1).tolist()
        matlab_data = pl.numpy_to_matlab(np.array([q]), ndigits=digits)
        python_data = str(np.array(q).round(digits).tolist())
        data_format = 'quaternion [x,y,z,w]'
        data_label = 'q'
    else:
        raise Exception('attribute "format_of_display_orientation" must be either "matrix" or "quaternion": {:s}'.format(f))
    return {
        'matlab_data': matlab_data,
        'python_data': python_data,
        'data_format': data_format,
        'data_label': data_label
    }


def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answer_name')

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    # Convert from json to dict
    a_sub = b64_to_dict(a_sub)

    # Put it into data
    data['submitted_answers'][name] = a_sub


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answer_name')

    # Check if this element is intended to produce a grade
    will_be_graded = pl.get_boolean_attrib(element, 'grade', True)
    if not will_be_graded:
        return

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get submitted answer (the "state")
    state = data['submitted_answers'].get(answer_name, None)
    if state is None:
        # This should never happen! If it does, just return nothing.
        return

    # Get correct answer (if none, don't grade)
    a = data['correct_answers'].get(answer_name, None)
    if a is None:
        return

    # Get format of correct answer
    f = pl.get_string_attrib(element, 'format_of_answer_orientation', 'rpy')

    # Convert submitted answer to Quaternion (first, roll [x,y,z,w] to [w,x,y,z])
    q_sub = pyquaternion.Quaternion(np.roll(state['body_quaternion'], 1))

    # Convert correct answer to Quaternion
    q_tru = convert_correct_answer_to_quaternion(f, a)

    # Find smallest angle of rotation between submitted orientation and correct orientation
    angle = np.abs((q_tru.inverse * q_sub).degrees)

    # Get tolerance
    tol = pl.get_float_attrib(element, 'tol_degrees', 5)
    if (tol <= 0):
        raise Exception('tolerance must be a positive real number (angle in degrees): {:g}'.format(tol))

    # Check if angle is below tolerance
    if (angle < tol):
        data['partial_scores'][answer_name] = {'score': 1, 'weight': weight, 'feedback': angle}
    else:
        data['partial_scores'][answer_name] = {'score': 0, 'weight': weight, 'feedback': angle}


def convert_correct_answer_to_quaternion(f, a):
    if f == 'rpy':
        try:
            rpy = np.array(a, dtype=np.float64)
            if rpy.shape == (3,):
                qx = pyquaternion.Quaternion(axis=[1, 0, 0], degrees=rpy[0])
                qy = pyquaternion.Quaternion(axis=[0, 1, 0], degrees=rpy[1])
                qz = pyquaternion.Quaternion(axis=[0, 0, 1], degrees=rpy[2])
                return qx * qy * qz
            else:
                raise ValueError()
        except:
            raise Exception('correct answer must be a set of roll, pitch, yaw angles in degrees with format "[roll, pitch, yaw]"')
    elif f == 'quaternion':
        try:
            q = np.array(a, dtype=np.float64)
            if (q.shape == (4,)) and np.allclose(np.linalg.norm(q), 1.0):
                return pyquaternion.Quaternion(np.roll(q, 1))
            else:
                raise ValueError()
        except:
            raise Exception('correct answer must be a unit quaternion with format "[x, y, z, w]"')
    elif f == 'matrix':
        try:
            R = np.array(a, dtype=np.float64)
            return pyquaternion.Quaternion(matrix=R)
        except:
            raise Exception('correct answer must be a 3x3 rotation matrix with format "[[ ... ], [ ... ], [ ... ]]"')
    elif f == 'axisangle':
        try:
            q = np.array(json.loads(a), dtype=np.float64)
            if (q.shape == (4,)):
                axis = q[0:3]
                angle = q[3]
                if np.allclose(np.linalg.norm(axis), 1.0):
                    return np.roll(pyquaternion.Quaternion(axis=axis, degrees=angle).elements, -1).tolist()
                else:
                    raise ValueError()
            else:
                raise ValueError()
        except:
            raise Exception('correct answer must be "[x, y, z, angle]" where (x, y, z) are the components of a unit vector and where the angle is in degrees')
    else:
        raise Exception('"format_of_answer_orientation" must be "rpy", "quaternion", "matrix", or "axisangle": {:s}'.format(f))


def dict_to_b64(d):
    return base64.b64encode(json.dumps(d).encode('utf-8')).decode()


def b64_to_dict(b64):
    return json.loads(base64.b64decode(b64).decode())


def get_file_url(element, data):
    # Get file name or raise exception if one does not exist
    file_name = pl.get_string_attrib(element, 'file_name')

    # Get directory (default is clientFilesQuestion)
    file_directory = pl.get_string_attrib(element, 'file_directory', 'clientFilesQuestion')

    # Get base url, which depends on the directory
    if file_directory == 'clientFilesQuestion':
        base_url = data['options']['client_files_question_url']
    elif file_directory == 'clientFilesCourse':
        base_url = data['options']['client_files_course_url']
    else:
        raise ValueError('file_directory "{}" is not valid (must be "clientFilesQuestion" or "clientFilesCourse")'.format(file_directory))

    # Get full url
    file_url = os.path.join(base_url, file_name)

    return file_url


def get_body_orientation(element):
    s = pl.get_string_attrib(element, 'body_orientation', None)
    if s is None:
        return [0, 0, 0, 1]

    f = pl.get_string_attrib(element, 'format_of_body_orientation', 'rpy')
    if f == 'rpy':
        try:
            rpy = np.array(json.loads(s), dtype=np.float64)
            if rpy.shape == (3,):
                qx = pyquaternion.Quaternion(axis=[1, 0, 0], degrees=rpy[0])
                qy = pyquaternion.Quaternion(axis=[0, 1, 0], degrees=rpy[1])
                qz = pyquaternion.Quaternion(axis=[0, 0, 1], degrees=rpy[2])
                return np.roll((qx * qy * qz).elements, -1).tolist()
            else:
                raise ValueError()
        except:
            raise Exception('attribute "body_orientation" must be a set of roll, pitch, yaw angles in degrees with format "[roll, pitch, yaw]": {:s}'.format(s))
    elif f == 'quaternion':
        try:
            q = np.array(json.loads(s), dtype=np.float64)
            if (q.shape == (4,)) and np.allclose(np.linalg.norm(q), 1.0):
                return q.tolist()
            else:
                raise ValueError()
        except:
            raise Exception('attribute "body_orientation" must be a unit quaternion with format "[x, y, z, w]": {:s}'.format(s))
    elif f == 'matrix':
        try:
            R = np.array(json.loads(s), dtype=np.float64)
            return np.roll(pyquaternion.Quaternion(matrix=R).elements, -1).tolist()
        except:
            raise Exception('attribute "body_orientation" must be a 3x3 rotation matrix with format "[[ ... ], [ ... ], [ ... ]]": {:s}'.format(s))
    elif f == 'axisangle':
        try:
            q = np.array(json.loads(s), dtype=np.float64)
            if (q.shape == (4,)):
                axis = q[0:3]
                angle = q[3]
                if np.allclose(np.linalg.norm(axis), 1.0):
                    return np.roll(pyquaternion.Quaternion(axis=axis, degrees=angle).elements, -1).tolist()
                else:
                    raise ValueError()
            else:
                raise ValueError()
        except:
            raise Exception('attribute "body_orientation" must have format "[x, y, z, angle]" where (x, y, z) are the components of a unit vector and where the angle is in degrees: {:s}'.format(s))
    else:
        raise Exception('attribute "format_of_body_orientation" must be "rpy", "quaternion", "matrix", or "axisangle": {:s}'.format(f))


def get_camera_position(element):
    p = pl.get_string_attrib(element, 'camera_position', '[5, 2, 2]')
    try:
        p_arr = np.array(json.loads(p), dtype=np.float64)
        if (p_arr.shape == (3,)) and not np.allclose(p_arr, np.array([0, 0, 0])):
            return p_arr.tolist()
        else:
            raise ValueError()
    except:
        raise Exception('attribute "camera_position" must have format [x, y, z] and must be non-zero: {:s}'.format(p))
