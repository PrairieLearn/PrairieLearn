import random, copy
import prairielearn as pl

def generate(data):

    # Sample two complex numbers with real and imaginary parts that are
    # random integers between -5 and 5 (inclusive)
    a = random.randint(-5, 5) + random.randint(-5, 5)*1j
    b = random.randint(-5, 5) + random.randint(-5, 5)*1j

    # Put string representations of these two complex numbers into data['params']
    data['params']['a'] = '{:.0f}'.format(a)
    data['params']['b'] = '{:.0f}'.format(b)

    # Compute the sum of these two complex numbers
    c = a + b

    # Put the sum into data['correct_answers']
    data['correct_answers']['c'] = pl.to_json(c)
