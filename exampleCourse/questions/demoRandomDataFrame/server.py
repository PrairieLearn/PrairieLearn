import random
import pandas as pd
import prairielearn as pl

def generate(data):
    
    # Generates number of events. 
    x_events = random.randint(4, 7)
    
    # Control rounding
    n_digits = 2
    
    # Generate random integers up to a number
    r = [float(random.randint(1, 100)) for i in range(x_events)]
    
    # Sum events
    s = sum(r)
    
    # Divide each value by sum to bring into [0, 1]
    # Round events
    a = [ round(i/s, n_digits) for i in r ]
    
    # Enforce probability summation constraint
    prob_sum = sum(a)
    capped_sum = round(1 - prob_sum, n_digits)
    
    # Truncate
    if not capped_sum.is_integer():
      max_val = max(a)
      max_ind = a.index(max_val)
      a[max_ind] += capped_sum

    d = {'P(X)': a}
    df = pd.DataFrame(data = d)
    
    data['params']['df'] = pl.to_json(df)

    data['correct_answers']['p_sum'] = sum(a)
    data['correct_answers']['big_event'] = a.index(max(a))