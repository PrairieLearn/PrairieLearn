#!/usr/bin/env python3

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
            print(m)
        sys.exit(1)
    CONVERT_CMD = magicks[0]

# find strings that look like "TEX:abc" or 'TEX:abc' (note different quote types
# use <quote> to store the type of quote
# use the negative-lookahead regex ((?!(?P=quote)).) to match non-quote characters
TEXT_RE = re.compile("(?P<quote>['\"])TEX:(((?!(?P=quote)).)+)(?P=quote)")

# filename regexp for generated files
FILENAME_RE = re.compile("[0-9a-fA-F]{40}\\..{3}")

if len(sys.argv) >= 2 and sys.argv[1] == "--outdir":
    MODE = "textdir"
    TEXT_DIR = sys.argv[2]
    BASE_DIRS = sys.argv[3:]
else:
    MODE = "subdir"
    BASE_DIRS = sys.argv[1:]

if len(BASE_DIRS) == 0:
    if os.path.isdir('/course'):
        BASE_DIRS = ['/course']

if len(BASE_DIRS) == 0:
    print("Usage: generate_text <basedir1> <basedir2> ...")
    print("or: generate_text --outdir <outputdir> <basedir1> <basedir2> ...")
    sys.exit(0)

print("Using convert command: %s" % CONVERT_CMD)
if MODE == "textdir":
    print("Output directory: %s" % TEXT_DIR)
else:
    print("Output directory: 'text/' within each subdirectory")
print("Processing directories: %s" % (", ".join(BASE_DIRS)))

def output_dir(filename):
    if MODE == "textdir":
        return TEXT_DIR
    else:
        return os.path.join(os.path.dirname(filename), "text")

def ensure_dir_exists(d):
    if not os.path.isdir(d):
        os.mkdir(d)
    
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
    img_filenames = []
    with open(filename, encoding="utf-8") as file:
        for line in file:
            for match in TEXT_RE.finditer(line):
                match_text = match.group(2)
                text = unescape(match_text)
                hash = hashlib.sha1(text.encode()).hexdigest()
                print(hash + " " + text)
                tex_filename = hash + ".tex"
                pdf_filename = hash + ".pdf"
                img_filename = hash + ".png"
                outdir = output_dir(filename)
                ensure_dir_exists(outdir)
                tex_full_filename = os.path.join(outdir, tex_filename)
                img_full_filename = os.path.join(outdir, img_filename)
                if not os.path.exists(img_full_filename):
                    print("Writing tex file " + tex_full_filename)
                    with open(tex_full_filename, "w", encoding="utf-8") as texfile:
                        texfile.write("\\documentclass[12pt]{article}\n")
                        texfile.write("\\usepackage{amsmath,amsthm,amssymb}\n")
                        texfile.write("\\begin{document}\n")
                        texfile.write("\\thispagestyle{empty}\n")
                        texfile.write(text + "\n")
                        texfile.write("\\end{document}\n")
                    print("Running pdflatex on " + tex_filename)
                    subprocess.check_call(["pdflatex", tex_filename], cwd=outdir)
                    print("Running convert on " + pdf_filename)
                    subprocess.check_call([CONVERT_CMD, "-density", "96",
                                           pdf_filename, "-trim", "+repage",
                                           img_filename], cwd=outdir)
                img_filenames.append(img_filename)
                img_hi_filename = hash + "_hi.png"
                img_hi_full_filename = os.path.join(outdir, img_hi_filename)
                if not os.path.exists(img_hi_full_filename):
                    print("Writing tex file " + tex_full_filename)
                    with open(tex_full_filename, "w", encoding="utf-8") as texfile:
                        texfile.write("\\documentclass[12pt]{article}\n")
                        texfile.write("\\usepackage{amsmath,amsthm,amssymb}\n")
                        texfile.write("\\begin{document}\n")
                        texfile.write("\\thispagestyle{empty}\n")
                        texfile.write(text + "\n")
                        texfile.write("\\end{document}\n")
                    print("Running pdflatex on " + tex_filename)
                    subprocess.check_call(["pdflatex", tex_filename], cwd=outdir)
                    print("Running convert on " + pdf_filename)
                    subprocess.check_call([CONVERT_CMD, "-density", "600",
                                           pdf_filename, "-trim", "+repage",
                                           img_hi_filename], cwd=outdir)
                img_filenames.append(img_hi_filename)
    return img_filenames

def delete_non_matching(basedir, nondelete_filenames):
    if not os.path.exists(basedir) or not os.path.isdir(basedir):
        return
    filenames = os.listdir(basedir)
    for filename in filenames:
        if filename not in nondelete_filenames:
            if FILENAME_RE.match(filename):
                full_filename = os.path.join(basedir, filename)
                print("deleting " + full_filename)
                os.unlink(full_filename)

if MODE == "subdir":
    for basedir in BASE_DIRS:
        print("########################################")
        print("Processing %s" % basedir)
        for (dirpath, dirnames, filenames) in os.walk(basedir):
            img_filenames = []
            for filename in fnmatch.filter(filenames, "*.js"):
                img_filenames += process_file(os.path.join(dirpath, filename))
            text_dir = os.path.join(dirpath, "text")
            delete_non_matching(text_dir, img_filenames)
elif MODE == "textdir":
    img_filenames = []
    for basedir in BASE_DIRS:
        print("########################################")
        print("Processing %s" % basedir)
        for (dirpath, dirnames, filenames) in os.walk(basedir):
            for filename in fnmatch.filter(filenames, "*.js"):
                img_filenames += process_file(os.path.join(dirpath, filename))
    delete_non_matching(TEXT_DIR, img_filenames)
else:
    raise Exception("unknown MODE: " + MODE)
