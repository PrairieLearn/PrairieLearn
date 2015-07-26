#!/usr/bin/env python

import os, fnmatch, sys, re, hashlib, subprocess, platform, glob

CONVERT_CMD = "convert"
if platform.system() == "Windows":
    globspec = "C:\Program Files\ImageMagick*\convert.exe"
    magicks = glob.glob(globspec)
    if len(magicks) < 1:
        print("ERROR: No files match %s" % globspec)
        sys.exit(1)
    if len(magicks) > 1:
        print("ERROR: Multiple files match %s" % globspec)
        for m in magicks:
            print m
        sys.exit(1)
    CONVERT_CMD = magicks[0]

TEXT_RE = re.compile("\"TEX:([^\"]+)\"");

if len(sys.argv) <= 2:
    print("Usage: generate_text <outputdir> <basedir1> <basedir2> ...")
    sys.exit(0);

TEXT_DIR = sys.argv[1]
print("Convert command: %s" % CONVERT_CMD)
print("Output directory: %s" % TEXT_DIR)

if not os.path.isdir(TEXT_DIR):
    os.mkdir(TEXT_DIR)

escape_seqs = {
    "b": "\b",
    "f": "\f",
    "n": "\n",
    "r": "\r",
    "t": "\t",
    "v": "\v",
    "'": "'",
    '"': '"',
    "\\": "\\",
    }

def unescape(s):
    chars = []
    i = 0
    while i < len(s):
        if s[i] != "\\":
            chars.append(s[i])
        else:
            if i == len(s) - 1:
                break
            i += 1
            if s[i] in escape_seqs:
                chars.append(escape_seqs[s[i]])
        i += 1
    return "".join(chars)

def process_file(filename):
    print(filename)
    with open(filename) as file:
        for line in file:
            for matchtext in TEXT_RE.findall(line):
                text = unescape(matchtext)
                hash = hashlib.sha1(text.encode()).hexdigest()
                print(hash + " " + text)
                tex_filename = hash + ".tex"
                pdf_filename = hash + ".pdf"
                img_filename = hash + ".png"
                tex_full_filename = os.path.join(TEXT_DIR, tex_filename)
                img_full_filename = os.path.join(TEXT_DIR, img_filename)
                if not os.path.exists(img_full_filename):
                    print("Writing tex file " + tex_full_filename);
                    with open(tex_full_filename, "w") as texfile:
                        texfile.write("\\documentclass[12pt]{article}\n")
                        texfile.write("\\usepackage{amsmath,amsthm,amssymb}\n")
                        texfile.write("\\begin{document}\n")
                        texfile.write("\\thispagestyle{empty}\n")
                        texfile.write(text + "\n")
                        texfile.write("\\end{document}\n")
                    print("Running pdflatex on " + tex_filename);
                    subprocess.check_call(["pdflatex", tex_filename], cwd=TEXT_DIR)
                    print("Running convert on " + pdf_filename);
                    subprocess.check_call([CONVERT_CMD, "-density", "96",
                                           pdf_filename, "-trim", "+repage",
                                           img_filename], cwd=TEXT_DIR)

for basedir in sys.argv[2:]:
    print("########################################")
    print("Processing %s" % basedir)
    for (dirpath, dirnames, filenames) in os.walk(basedir):
        for filename in fnmatch.filter(filenames, "*.js"):
            process_file(os.path.join(dirpath, filename))

print("########################################")
print("Deleting intermediate files from %s" % TEXT_DIR)
filenames = os.listdir(TEXT_DIR)
for filename in filenames:
    (root, ext) = os.path.splitext(filename)
    if ext.lower() in [".pdf", ".tex", ".aux", ".log"]:
        full_filename = os.path.join(TEXT_DIR, filename)
        os.unlink(full_filename)
