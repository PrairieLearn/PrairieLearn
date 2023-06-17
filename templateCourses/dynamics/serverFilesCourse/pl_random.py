from sympy import *
import numpy as np
import random

# Create a random array of functions, where t is the variable, and n is the dimension of the vector
def randFuncArray(t, n):

    """ t: independent variable
        n: size of the array
    returns an array of size n composed of functions that are exponential,
    trigonometric, or quadratic"""

    func_type = ['quad', 'trig', 'exp']

    A_list = [-3, -2, -1, 1, 2, 3]
    B_list = [-3, -2, -1, 0, 1, 2, 3]
    C_list = B_list

    func_type_x = random.choice(func_type)
    func_type_y = random.choice(func_type)
    func_type_z = random.choice(func_type)

    if func_type_x == 'quad':
        rx = random.choice(A_list)*t**2 + random.choice(B_list)*t + random.choice(C_list)

    elif func_type_x == 'trig':
        trig_type = random.choice(['sin', 'cos'])
        if trig_type == 'sin':
            rx = random.choice(A_list) * sin(random.choice(A_list) * t)
        else:
            rx = random.choice(A_list) * cos(random.choice(A_list) * t)

    else:
        rx = random.choice(A_list)*exp(random.choice(A_list)*t)


    if func_type_y == 'quad':
        ry = random.choice(A_list)*t**2 + random.choice(B_list)*t + random.choice(C_list)

    elif func_type_y == 'trig':
        trig_type = random.choice(['sin', 'cos'])
        if trig_type == 'sin':
            ry = random.choice(A_list) * sin(random.choice(A_list) * t)
        else:
            ry = random.choice(A_list) * cos(random.choice(A_list) * t)

    else:
        ry = random.choice(A_list)*exp(random.choice(A_list)*t)

    if func_type_z == 'quad':
        rz = random.choice(A_list)*t**2 + random.choice(B_list)*t + random.choice(C_list)

    elif func_type_z == 'trig':
        trig_type = random.choice(['sin', 'cos'])
        if trig_type == 'sin':
            rz = random.choice(A_list) * sin(random.choice(A_list) * t)
        else:
            rz = random.choice(A_list) * cos(random.choice(A_list) * t)

    else:
        rz = random.choice(A_list)*exp(random.choice(A_list)*t)
    
    if n == 2:
        r = Matrix([rx, ry, 0])
    elif n == 3:
        r = Matrix([rx, ry, rz])
        
    return r

def randFunc(t):
    func_type = ['quad', 'trig', 'exp']

    A_list = [-3, -2, -1, 1, 2, 3]
    B_list = [-3, -2, -1, 0, 1, 2, 3]
    C_list = B_list

    if func_type == 'quad':
        f = random.choice(A_list) * t**2 + random.choice(B_list) * t + random.choice(C_list)
    elif func_type == 'trig':
        trig_type = random.choice(['sin', 'cos'])
        if trig_type == 'sin':
            f = random.choice(A_list) * sin(random.choice(A_list) * t)
        else:
            f = random.choice(A_list) * cos(random.choice(A_list) * t)
    else:
        f = random.choice(A_list)*exp(random.choice(A_list)*t)

    return f

def randExp(t):
    A_list = [-3, -2, -1, 1, 2, 3]

    return random.choice(A_list)*exp(random.choice(A_list)*t)

def randTrig(t):
    A_list = [-3, -2, -1, 1, 2, 3]
    trig_type = random.choice(['sin', 'cos'])
    if trig_type == 'sin':
        f = random.choice(A_list) * sin(random.choice(A_list) * t)
    else:
        f = random.choice(A_list) * cos(random.choice(A_list) * t)

    return f

def randPoly(t, n):

    """ t: independent variable
        n: degree of polynomial
    returns a polynomial of degree n
    """

    A_list = [-3, -2, -1, 1, 2, 3]
    B_list = [-3, -2, -1, 0, 1, 2, 3]
    C_list = B_list

    if n == 1:
        y = random.choice(A_list) * t + random.choice(B_list)
    elif n == 2:
        y = random.choice(A_list) * t**2 + random.choice(B_list) * t + random.choice(C_list)

    return y

def randIntNonZeroArray(n, a, b, step=1):

    """n: size of the array
       a: lower bound of the range of integers
       b : upper bound of the range of integers
    returns a non-zero vector whose components are integers in the range [a,b]

    """

    r = np.zeros(n)

    while np.linalg.norm(r) == 0:
        if n == 2:
            r = np.array([random.randrange(a, b, step), random.randrange(a, b, step), 0])
        elif n == 3:
            r = np.array([random.randrange(a, b, step), random.randrange(a, b, step), random.randrange(a, b, step)])

    return r

def randIntNonZero(a, b):
    """a: lower bound of the range of integers
       b: upper bound of the range of integers
    returns a non-zero integer in the range [a,b]
    """

    x = 0
    while x == 0:
        x = random.randint(a, b)

    return x

def randIntArray(n, a, b):
    """n: size of the array
       a: lower bound of the range of integers
       b : upper bound of the range of integers
    returns a vector whose components are integers in the range [a,b]

    """

    if n == 2:
        r = np.array([random.randint(a, b), random.randint(a, b), 0])
    elif n == 3:
        r = np.array([random.randint(a, b), random.randint(a, b), random.randint(a, b)])

    return r

def NChoice(n, l):
    if n > len(l):
        return l

    choice = []

    for i in range(n):
        x = random.choice(l)
        choice.append(x)
        l.remove(x)
    return choice

def randSign():
    return random.choice([-1, 1])

def randBool():
    return random.choice([True, False])