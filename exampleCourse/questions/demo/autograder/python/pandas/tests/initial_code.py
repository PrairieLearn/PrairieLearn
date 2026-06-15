import pandas as pd

df = pd.DataFrame(data={"a": [1, 2], "b": [3, 4]})

""" These are also okay:
df = pd.DataFrame(data={'b': [3, 4], 'a': [1, 2]})
df = pd.DataFrame(data={'a': [2, 1], 'b': [4, 3]}, index=[1, 0])
df = pd.DataFrame(data={'b': [4, 3], 'a': [2, 1]}, index=[1, 0])
"""
