from functools import wraps


def points(points):
    def decorator(f):
        @wraps(f)
        def decorated_f(*args, **kwargs):
            f.__dict__['points'] = points
            return f(*args, **kwargs)
        return decorated_f
    return decorator


def name(name):
    def decorator(f):
        @wraps(f)
        def decorated_f(*args, **kwargs):
            f.__dict__['name'] = name
            return f(*args, **kwargs)
        return decorated_f
    return decorator


class PLTestRunner():
