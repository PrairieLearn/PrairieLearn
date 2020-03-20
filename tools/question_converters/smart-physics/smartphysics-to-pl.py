import sys
import os
import uuid
import json
import xml.etree.ElementTree as ET
"""
Command line usage:

smartphysics-to-pl.py [xml file] [PrairieLearn question name]

This converts multiple choice questions from smart.physics XML format to 
the PrairieLearn directory structure. A new UUID is assigned automatically. 

If you want to convert free-answer questions (ex. homeworks), the main difference would be to change 
write_question().

The question may require some cleanup. Known problems include '{' characters in LaTeX formulas (which 
get replaced indiscriminantly), and images, which are just ignored.
"""

def transform_code(xml_code):
    xml_code = xml_code.replace("^", "**")
    return xml_code


def transform_insertions(smart_code):
    smart_code = smart_code.replace("{", "{{params.")
    smart_code = smart_code.replace("}", "}}")
    return smart_code


REPLACE_FUNCTIONS = """
import random
import math
from math import exp, sin, cos, tan, sqrt, atan, asin, acos,floor, log10

def aRound(f,n):
  return round(f,n)

def rRound(x,sig):
  return round(x, sig-int(floor(log10(abs(x))))-1)

def ln(f):
  return math.log(f)

def rand(start,end, seed):
  return random.randint(start,end)
\n\n"""


def make_export(code_text):
    retstr = ""
    for line in code_text.split("\n"):
        if "=" in line:
            varname = line.split("=")[0].strip()
            retstr += "    data['params']['" + varname + "']=" + varname + "\n"
    return retstr + "\n    return data\n\n"


def gen_info(my_id, xml_root):
    return {
        "uuid": str(my_id),
        "title": xml_root.find("title").text,
        "topic": "Topic",
        "tags": ["Sp20"],
        "type": "v3",
    }


def write_server(xml_root, f):
    f.write(REPLACE_FUNCTIONS)
    f.write("def generate(data):\n\n")
    if xml_root.find("code").text is not None:
        for line in xml_root.find("code").text.split("\n"):
            f.write("    " + transform_code(line) + "\n")
        f.write(make_export(xml_root.find("code").text))
    else:
        f.write("    return data")


def write_question(xml_root, f):
    f.write(
        """<pl-question-panel>
  """
    )
    f.write(
        transform_insertions(
            ET.tostring(xml_root.find("problemsetup"), encoding="unicode")
        )
    )
    f.write(
        """
</pl-question-panel>
"""
    )
    for iquestion, question in enumerate(xml_root.findall("question")):
        f.write(
            """
<div class="card my-2">
  <div class="card-header">
      
  </div>

  <div class="card-body">
      <pl-question-panel>
      """
        )
        f.write(
            transform_insertions(
                ET.tostring(question.find("questionprompt"), encoding="unicode")
            )
        )
        f.write(
            f"""
      </pl-question-panel>

      <pl-multiple-choice answers-name="question{iquestion}">
      \n"""
        )
        for answerchoice in question.findall("answerchoice"):
            iscorrect = answerchoice.attrib["iscorrect"]
            text = transform_insertions(
                ET.tostring(answerchoice.find("text"), encoding="unicode")
            )
            f.write(
                f"        <pl-answer correct = '{iscorrect}'> {text} </pl-answer> \n"
            )

        f.write(
            """
      </pl-multiple-choice>

  </div>
</div>

  """
        )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} [xml filename] [question directory]")
        exit(1)
    tree = ET.parse(sys.argv[1])
    xml_root = tree.getroot()

    dirname = sys.argv[2]
    try:
        os.mkdir(dirname)
    except:
        print("looks like ", dirname, "already exists")
        exit(1)
    my_id = uuid.uuid4()
    info = gen_info(my_id, xml_root)
    json.dump(info, open(dirname + "/info.json", "w"))
    write_server(xml_root, open(dirname + "/server.py", "w"))
    write_question(xml_root, open(dirname + "/question.html","w"))
