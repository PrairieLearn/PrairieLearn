import lxml.html
import numpy as np
import prairielearn

def prepare(element_html, element_index, data, options):
    return data

def render(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    html = "<pre>\n"
    for child in element:
        if child.tag == "variable":
            html += prairielearn.inner_html(child) \
                + " = " \
                + numpy_to_matlab(np.array(data["params"].get(child.get("name"),None))) \
                + "\n"
    html += "</pre>"
    return html

def parse(element_html, element_index, data, options):
    return data

# This function assumes that A is either a floating-point number or a
# real-valued numpy array. It returns A as a MATLAB-formatted string.
def numpy_to_matlab(A,ndigits=2,wtype='f'):
    if np.isscalar(A):
        A_str = '{:.{indigits}{iwtype}};'.format(A,indigits=ndigits,iwtype=wtype)
        return A_str
    else:
        s = A.shape
        m = s[0]
        n = s[1]
        A_str = '['
        for i in range(0,m):
            for j in range(0,n):
                A_str += '{:.{indigits}{iwtype}}'.format(A[i,j],indigits=ndigits,iwtype=wtype)
                if j==n-1:
                    if i==m-1:
                        A_str += '];'
                    else:
                        A_str += '; '
                else:
                    A_str += ' '
        return A_str

def grade(element_html, element_index, data, options):
    return data
