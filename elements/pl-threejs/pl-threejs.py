import prairielearn as pl
import lxml.html
import chevron
import numpy as np
import json
import base64
import os
import pyquaternion
import math


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = [
        'answer_name',          # key for 'submitted_answers' and 'true_answers'
    ]
    optional_attribs = [
        'body-position',        # [x, y, z]
        'body-orientation',     # [x, y, z, w] or [roll, pitch, yaw] or rotation matrix (3x3 ndarray) or exponential coordinates [wx, wy, wz]
        'camera-position',      # [x, y, z] - camera is z up and points at origin of space frame
        'body-cantranslate',         # true (default) or false
        'body-canrotate',         # true (default) or false
        'camera-canmove',       # true (default) or false
        'body-pose-format',       # 'rpy' (default), 'quaternion', 'matrix', 'axisangle'
        'answer-pose-format',     # 'rpy' (default), 'quaternion', 'matrix', 'axisangle'
        'text-pose-format',    # 'matrix' (default), 'quaternion', 'homogeneous'
        'show-pose-in-question',            # true (default) or false
        'show-pose-in-correct-answer',      # true (default) or false
        'show-pose-in-submitted-answer',    # true (default) or false
        'tol-translation',      # 0.5 (default : float > 0)
        'tol-rotation',          # 5 (default : float > 0)
        'grade'                 # true (default) or false
    ]
    pl.check_attribs(element, required_attribs=required_attribs, optional_attribs=optional_attribs)


def get_objects(element, data):
    obj_list = []

    for child in element:
        is_stl = (child.tag in ['pl-threejs-stl', 'pl_threejs_stl'])
        is_txt = (child.tag in ['pl-threejs-txt', 'pl_threejs_txt'])
        if not (is_stl or is_txt):
            continue

        # Type-specific check and get (stl)
        if is_stl:
            # Attributes
            pl.check_attribs(child, required_attribs=['file-name'], optional_attribs=['file-directory', 'frame', 'color', 'position', 'orientation', 'format', 'scale', 'opacity'])
            # - file-name (and file-directory)
            file_url = get_file_url(child, data)
            # - type
            object_type = 'stl'
            # - object
            specific = {
                'type': object_type,
                'file_url': file_url
            }

        # Type-specific check and get (txt)
        if is_txt:
            # Attributes
            pl.check_attribs(child, required_attribs=[], optional_attribs=['frame', 'color', 'position', 'orientation', 'format', 'scale', 'opacity'])
            # - text
            text = pl.inner_html(child)
            # - type
            object_type = 'txt'
            # - object
            specific = {
                'type': object_type,
                'text': text
            }

        # Common
        # - frame
        frame = pl.get_string_attrib(child, 'frame', 'body')
        if frame not in ['body', 'space']:
            raise Exception('"frame" must be either "body" or "space": {:s}'.format(frame))
        if frame == 'body':
            default_color = '#e84a27'
            default_opacity = 0.7
        else:
            default_color = '#13294b'
            default_opacity = 0.4
        # - color
        color = pl.get_color_attrib(child, 'color', default_color)
        # - opacity
        opacity = pl.get_float_attrib(child, 'opacity', default_opacity)
        # - position
        p = pl.get_string_attrib(child, 'position', '[0, 0, 0]')
        try:
            position = np.array(json.loads(p), dtype=np.float64)
            if position.shape == (3,):
                position = position.tolist()
            else:
                raise ValueError()
        except Exception:
            raise Exception('attribute "position" must have format [x, y, z]: {:s}'.format(p))
        # - orientation (and format)
        orientation = get_orientation(child, 'orientation', 'format')
        # - scale
        scale = pl.get_float_attrib(child, 'scale', 1.0)

        common = {
            'frame': frame,
            'color': color,
            'opacity': opacity,
            'position': position,
            'quaternion': orientation,
            'scale': scale
        }

        obj = {**specific, **common}
        obj_list.append(obj)

    return obj_list


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answer-name')

    uuid = pl.get_uuid()

    body_position = get_position(element, 'body-position', default=[0, 0, 0])
    body_orientation = get_orientation(element, 'body-orientation', 'body-pose-format')
    camera_position = get_position(element, 'camera-position', default=[5, 2, 2], must_be_nonzero=True)
    body_cantranslate = pl.get_boolean_attrib(element, 'body-cantranslate', True)
    body_canrotate = pl.get_boolean_attrib(element, 'body-canrotate', True)
    camera_canmove = pl.get_boolean_attrib(element, 'camera-canmove', True)
    text_pose_format = pl.get_string_attrib(element, 'text-pose-format', 'matrix')
    if text_pose_format not in ['matrix', 'quaternion', 'homogeneous']:
        raise Exception('attribute "text-pose-format" must be either "matrix", "quaternion", or homogeneous')
    objects = get_objects(element, data)

    if data['panel'] == 'question':
        will_be_graded = pl.get_boolean_attrib(element, 'grade', True)
        show_pose = pl.get_boolean_attrib(element, 'show-pose-in-question', True)

        # Restore pose of body and camera, if available - otherwise use values
        # from attributes (note that restored pose will also have camera_orientation,
        # which we currently ignore because the camera is always z up and looking
        # at the origin of the space frame).
        #
        # Be careful. It's possible that data['submitted_answers'][answer_name]
        # exists but is None (due to some other error). So we need to use None
        # as the default and to check if the result - either from the existing
        # value or the default value - is None.
        pose_default = {
            'body_quaternion': body_orientation,
            'body_position': body_position,
            'camera_position': camera_position
        }
        pose = data['submitted_answers'].get(answer_name, None)
        if pose is None:
            pose = pose_default

        # These are passed as arguments to PLThreeJS constructor in client code
        options = {
            'uuid': uuid,
            'pose': dict_to_b64(pose),
            'pose_default': dict_to_b64(pose_default),
            'body_cantranslate': body_cantranslate,
            'body_canrotate': body_canrotate,
            'camera_canmove': camera_canmove,
            'text_pose_format': text_pose_format,
            'objects': objects
        }

        # These are used for templating
        html_params = {
            'question': True,
            'uuid': uuid,
            'answer_name': answer_name,
            'show_bodybuttons': body_cantranslate or body_canrotate,
            'show_toggle': body_cantranslate and body_canrotate,
            'show_reset': body_cantranslate or body_canrotate or camera_canmove,
            'show_pose': show_pose,
            'show_instructions': will_be_graded,
            'tol_translation': '{:.2f}'.format(pl.get_float_attrib(element, 'tol-translation', 0.5)),
            'tol_rotation': '{:.1f}'.format(pl.get_float_attrib(element, 'tol-rotation', 5)),
            'default_is_python': True,
            'options': json.dumps(options, allow_nan=False)
        }

        with open('pl-threejs.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'submission':
        will_be_graded = pl.get_boolean_attrib(element, 'grade', True)
        if not will_be_graded:
            return ''

        show_pose = pl.get_boolean_attrib(element, 'show-pose-in-submitted-answer', True)

        # Get submitted answer
        pose = data['submitted_answers'].get(answer_name)

        # These are passed as arguments to PLThreeJS constructor in client code
        options = {
            'uuid': uuid,
            'pose': dict_to_b64(pose),
            'body_cantranslate': False,
            'body_canrotate': False,
            'camera_canmove': False,
            'text_pose_format': text_pose_format,
            'objects': objects
        }

        # These are used for templating
        html_params = {
            'submission': True,
            'uuid': uuid,
            'answer_name': answer_name,
            'show_bodybuttons': False,
            'show_toggle': False,
            'show_pose': show_pose,
            'default_is_python': True,
            'options': json.dumps(options, allow_nan=False)
        }

        partial_score = data['partial_scores'].get(answer_name, None)
        if partial_score is not None:
            html_params['error_in_translation'] = str(np.abs(np.round(partial_score['feedback']['error_in_translation'], 2)))
            html_params['error_in_rotation'] = str(np.abs(np.round(partial_score['feedback']['error_in_rotation'], 1)))
            html_params['show_feedback'] = True
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
                except Exception:
                    raise ValueError('invalid score' + score)

        with open('pl-threejs.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        will_be_graded = pl.get_boolean_attrib(element, 'grade', True)
        if not will_be_graded:
            return ''

        show_pose = pl.get_boolean_attrib(element, 'show-pose-in-correct-answer', True)

        # Get submitted answer
        pose = data['submitted_answers'].get(answer_name, None)
        if pose is None:
            # If we are here, an error has occurred. Replace pose with its default.
            # (Only pose['camera_position'] is actually used.)
            pose = {
                'body_quaternion': body_orientation,
                'body_position': body_position,
                'camera_position': camera_position
            }

        # Get correct answer
        a = data['correct_answers'].get(answer_name, None)
        if a is None:
            return ''

        # Convert correct answer to Quaternion, then to [x, y, z, w]
        f = pl.get_string_attrib(element, 'answer-pose-format', 'rpy')
        p, q = parse_correct_answer(f, a)
        p = p.tolist()
        q = np.roll(q.elements, -1).tolist()

        # Replace body pose with correct answer
        pose['body_position'] = p
        pose['body_quaternion'] = q

        # These are passed as arguments to PLThreeJS constructor in client code
        options = {
            'uuid': uuid,
            'pose': dict_to_b64(pose),
            'body_cantranslate': False,
            'body_canrotate': False,
            'camera_canmove': False,
            'text_pose_format': text_pose_format,
            'objects': objects
        }

        # These are used for templating
        html_params = {
            'answer': True,
            'uuid': uuid,
            'answer_name': answer_name,
            'show_bodybuttons': False,
            'show_toggle': False,
            'show_pose': show_pose,
            'default_is_python': True,
            'options': json.dumps(options, allow_nan=False)
        }

        with open('pl-threejs.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answer-name')

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return

    # Convert from json to dict or return parse error on failure (if there is
    # a failure, it would be due to corrupt data from the hidden input element).
    try:
        a_sub = b64_to_dict(a_sub)
    except Exception:
        data['format_errors'][name] = 'Invalid submitted answer.'
        data['submitted_answers'][name] = None
        return

    # Put it into data
    data['submitted_answers'][name] = a_sub


def grade(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, 'answer-name')

    # Check if this element is intended to produce a grade
    will_be_graded = pl.get_boolean_attrib(element, 'grade', True)
    if not will_be_graded:
        return

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get submitted answer (the "state")
    state = data['submitted_answers'].get(answer_name, None)
    if state is None:
        # This might happen. It means that, somehow, the hidden input element
        # did not get populated with the PLThreeJS state. The student is not at
        # fault, so we'll return nothing - don't grade.
        return

    # Get correct answer (if none, don't grade)
    a = data['correct_answers'].get(answer_name, None)
    if a is None:
        return

    # Get submitted position (as np.array([x, y, z]))
    p_sub = np.array(state['body_position'])

    # Get submitted orientation (as Quaternion - first, roll [x,y,z,w] to [w,x,y,z])
    q_sub = pyquaternion.Quaternion(np.roll(state['body_quaternion'], 1))

    # Get format of correct answer
    f = pl.get_string_attrib(element, 'answer-pose-format', 'rpy')

    # Get correct position (as np.array([x, y, z])) and orientation (as Quaternion)
    p_tru, q_tru = parse_correct_answer(f, a)

    # Find distance between submitted position and correct position
    error_in_translation = np.linalg.norm(p_sub - p_tru)

    # Find smallest angle of rotation between submitted orientation and correct orientation
    error_in_rotation = np.abs((q_tru.inverse * q_sub).degrees)

    # Get tolerances
    tol_translation = pl.get_float_attrib(element, 'tol-translation', 0.5)
    tol_rotation = pl.get_float_attrib(element, 'tol-rotation', 5)
    if (tol_translation <= 0):
        raise Exception('tol_translation must be a positive real number: {:g}'.format(tol_translation))
    if (tol_rotation <= 0):
        raise Exception('tol_rotation must be a positive real number (angle in degrees): {:g}'.format(tol_rotation))

    # Check if angle is no greater than tolerance
    if ((error_in_rotation <= tol_rotation) and (error_in_translation <= tol_translation)):
        data['partial_scores'][answer_name] = {'score': 1, 'weight': weight, 'feedback': {'error_in_rotation': error_in_rotation, 'error_in_translation': error_in_translation}}
    else:
        data['partial_scores'][answer_name] = {'score': 0, 'weight': weight, 'feedback': {'error_in_rotation': error_in_rotation, 'error_in_translation': error_in_translation}}


def parse_correct_answer(f, a):
    if f == 'homogeneous':
        try:
            T = np.array(a, dtype=np.float64)
            if T.shape == (4, 4):
                R = T[0:3, 0:3]
                p = T[0:3, 3:4]
                return np.reshape(p, (3,)), pyquaternion.Quaternion(matrix=R)
            else:
                raise ValueError()
        except Exception:
            raise Exception('correct answer must be a 4x4 homogeneous transformation matrix with format "[[...], [...], [...], [...]]"')
    elif f == 'rpy':
        try:
            p = np.reshape(np.array(a[0], dtype=np.float64), (3,))
            rpy = np.array(a[1], dtype=np.float64)
            if rpy.shape == (3,):
                qx = pyquaternion.Quaternion(axis=[1, 0, 0], degrees=rpy[0])
                qy = pyquaternion.Quaternion(axis=[0, 1, 0], degrees=rpy[1])
                qz = pyquaternion.Quaternion(axis=[0, 0, 1], degrees=rpy[2])
                return np.reshape(p, (3,)), qx * qy * qz
            else:
                raise ValueError()
        except Exception:
            raise Exception('correct answer must be a list [position, orientation], where position is [x, y, z] and orientation is a set of roll, pitch, yaw angles in degrees with format "[roll, pitch, yaw]"')
    elif f == 'quaternion':
        try:
            p = np.reshape(np.array(a[0], dtype=np.float64), (3,))
            q = np.array(a[1], dtype=np.float64)
            if (q.shape == (4,)) and np.allclose(np.linalg.norm(q), 1.0):
                return np.reshape(p, (3,)), pyquaternion.Quaternion(np.roll(q, 1))
            else:
                raise ValueError()
        except Exception:
            raise Exception('correct answer must be a list [position, orientation], where position is [x, y, z] and orientation is a unit quaternion with format "[x, y, z, w]"')
    elif f == 'matrix':
        try:
            p = np.reshape(np.array(a[0], dtype=np.float64), (3,))
            R = np.array(a[1], dtype=np.float64)
            return np.reshape(p, (3,)), pyquaternion.Quaternion(matrix=R)
        except Exception:
            raise Exception('correct answer must be a list [position, orientation], where position is [x, y, z] and orientation is a 3x3 rotation matrix with format "[[ ... ], [ ... ], [ ... ]]"')
    elif f == 'axisangle':
        try:
            p = np.reshape(np.array(a[0], dtype=np.float64), (3,))
            q = np.array(json.loads(a[1]), dtype=np.float64)
            if (q.shape == (4,)):
                axis = q[0:3]
                angle = q[3]
                if np.allclose(np.linalg.norm(axis), 1.0):
                    return np.reshape(p, (3,)), np.roll(pyquaternion.Quaternion(axis=axis, degrees=angle).elements, -1).tolist()
                else:
                    raise ValueError()
            else:
                raise ValueError()
        except Exception:
            raise Exception('correct answer must be a list [position, orientation], where position is [x, y, z] and orientation is "[x, y, z, angle]" where (x, y, z) are the components of a unit vector and where the angle is in degrees')
    else:
        raise Exception('"answer-pose-format" must be "rpy", "quaternion", "matrix", "axisangle", or "homogeneous": {:s}'.format(f))


def dict_to_b64(d):
    return base64.b64encode(json.dumps(d, allow_nan=False).encode('utf-8')).decode()


def b64_to_dict(b64):
    return json.loads(base64.b64decode(b64).decode())


def get_file_url(element, data):
    # Get file name or raise exception if one does not exist
    file_name = pl.get_string_attrib(element, 'file-name')

    # Get directory (default is clientFilesQuestion)
    file_directory = pl.get_string_attrib(element, 'file-directory', 'clientFilesQuestion')

    # Get base url, which depends on the directory
    if file_directory == 'clientFilesQuestion':
        base_url = data['options']['client_files_question_url']
    elif file_directory == 'clientFilesCourse':
        base_url = data['options']['client_files_course_url']
    else:
        raise ValueError('file-directory "{}" is not valid (must be "clientFilesQuestion" or "clientFilesCourse")'.format(file_directory))

    # Get full url
    file_url = os.path.join(base_url, file_name)

    return file_url


def get_orientation(element, name_orientation, name_format):
    s = pl.get_string_attrib(element, name_orientation, None)
    if s is None:
        return [0, 0, 0, 1]

    f = pl.get_string_attrib(element, name_format, 'rpy')
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
        except Exception:
            raise Exception('attribute "{:s}" with format "{:s}" must be a set of roll, pitch, yaw angles in degrees with format "[roll, pitch, yaw]": {:s}'.format(name_orientation, name_format, s))
    elif f == 'quaternion':
        try:
            q = np.array(json.loads(s), dtype=np.float64)
            if (q.shape == (4,)) and np.allclose(np.linalg.norm(q), 1.0):
                return q.tolist()
            else:
                raise ValueError()
        except Exception:
            raise Exception('attribute "{:s}" with format "{:s}" must be a unit quaternion with format "[x, y, z, w]": {:s}'.format(name_orientation, name_format, s))
    elif f == 'matrix':
        try:
            R = np.array(json.loads(s), dtype=np.float64)
            return np.roll(pyquaternion.Quaternion(matrix=R).elements, -1).tolist()
        except Exception:
            raise Exception('attribute "{:s}" with format "{:s}" must be a 3x3 rotation matrix with format "[[ ... ], [ ... ], [ ... ]]": {:s}'.format(name_orientation, name_format, s))
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
        except Exception:
            raise Exception('attribute "{:s}" with format "{:s}" must have format "[x, y, z, angle]" where (x, y, z) are the components of a unit vector and where the angle is in degrees: {:s}'.format(name_orientation, name_format, s))
    else:
        raise Exception('attribute "{:s}" must be "rpy", "quaternion", "matrix", or "axisangle": {:s}'.format(name_format, f))


def get_position(element, name_position, default=[0, 0, 0], must_be_nonzero=False):
    s = pl.get_string_attrib(element, name_position, None)
    if s is None:
        return default
    try:
        p = np.array(json.loads(s), dtype=np.float64)
        if p.shape == (3,):
            if must_be_nonzero and np.allclose(p, np.array([0, 0, 0])):
                raise ValueError('attribute "{:s}" must be non-zero'.format(name_position))
            else:
                return p.tolist()
        else:
            raise ValueError()
    except Exception:
        raise Exception('attribute "{:s}" must have format "[x, y, z]": {:s}'.format(name_position, s))
