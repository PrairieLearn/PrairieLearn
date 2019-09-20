import re
import json

# parse the doc.md for a list of attributes for each element
# this is pretty hastily written, might be better not to look too closely...

def filter_idx(f, lst):
    ret = []
    for i, elem in enumerate(lst):
        if f(elem):
            ret.append(i)
    return ret

docfile = open("doc.md")
doctxt = docfile.read().split('\n')

elements_start = filter_idx(lambda x: x.startswith('## '), doctxt)
num_elem = len(elements_start)
elements = {}

for i in range(num_elem):
    if i == (num_elem - 1):
        lines = doctxt[elements_start[i]:]
    else:
        lines = doctxt[elements_start[i]:elements_start[i+1]]
    name = re.search("`(.+?)`", doctxt[elements_start[i]])[1]

    if not name in elements:
        elements[name] = []
    
    sections = filter_idx(lambda x: x.startswith('#'), lines)
    tableSection = -1
    for i, section in enumerate(sections):
        if lines[section].startswith('#### Custom'):
            tableSection = i
            break

    if tableSection == -1:
        continue
        
    if tableSection == len(sections) - 1:
        table = lines[sections[tableSection]:]
    else:
        table = lines[sections[tableSection]:sections[tableSection + 1]]
    tableAry = list(map(lambda x: x.split("|"), table))

    for tabEntry in tableAry:
        match = re.match("`(.+?)`", tabEntry[0])
        if match != None:
            elements[name].append(match[1])

print(json.dumps(elements))
