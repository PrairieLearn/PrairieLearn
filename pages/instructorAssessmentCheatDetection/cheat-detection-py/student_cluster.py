import itertools
import random
import pandas as pd
import numpy as np
import networkx as nx
from times import Times
import csv
        
""" 
    This file is for testing use. 
    These two methods are also in students_map.py.
"""
# cheating cluster
def student_clusters(cheating_pairs):
    cheating_graph = nx.DiGraph(nx.Graph(cheating_pairs))
    raw_cycles = list(nx.simple_cycles(cheating_graph))
    cycles = clean_cycles(raw_cycles)
    return cycles

def clean_cycles(raw_cycles):
    cycles = []
    raw_cycles = sorted([set(i) for i in raw_cycles])
    for i in range(len(raw_cycles)):
        included = False
        for j in range(i+1, len(raw_cycles)):
            if raw_cycles[i].intersection(raw_cycles[j]) == raw_cycles[i]:
                included = True
                continue
        if not included:
            cycles.append(raw_cycles[i])
    return cycles


l = [(1,2), (1,3), (1,4), (2,3), (2,4), (3,4), (4,5), (6,7)]
print("cheating clusters: ")
print(student_clusters(l))