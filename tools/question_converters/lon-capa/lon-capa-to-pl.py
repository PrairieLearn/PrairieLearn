import os, sys, shutil, uuid, json
import xml.etree.ElementTree as ET

## # Top-level elements
## root.findall(".")
## 
## # All 'neighbor' grand-children of 'country' children of the top-level
## # elements
## root.findall("./country/neighbor")
## 
## # Nodes with name='Singapore' that have a 'year' child
## root.findall(".//year/..[@name='Singapore']")
## 
## # 'year' nodes that are children of nodes with name='Singapore'
## root.findall(".//*[@name='Singapore']/year")
## 
## # All 'neighbor' nodes that are the second child of their parent
## root.findall(".//neighbor[2]")

## really annoying namespace attached to every xml type; using 'nm' as a shorthand
nm = '{http://www.imsglobal.org/xsd/imscp_v1p1}'
client_file_path = 'clientFilesQuestion'

## use the questions directory in the current directory or recursively search parent directories
def find_questions():
    questions = 'questions'
    while not os.path.isdir(questions):
        questions = '../' + questions
    print('using questions directory: ' + questions)
    return questions + '/'

def make_directory_if_not_exists(path):
    if not os.path.isdir(path):
       os.mkdir(path)

def make_info_json_if_not_exists(path, title):
    if os.path.isfile(path):
        return

    info = { 'uuid' : str(uuid.uuid4()),
             'title' : title,
             'topic' : 'Test',
             'tags' : [],
             'type' : 'v3' }

    with open(path, 'w') as out_file:
        json.dump(info, out_file, indent=4)


# perl prepends variables with a $; we're going to convert those into {{ params.foo }} tokens
def translate_variables(token):
    if token[0] != '$':
       return token

    str = token.replace('$', '').replace('[', '_').replace(']', '_')    
    punct = ''

    # we don't want to include punctuation in the variable
    if str[-1] in '.?,;!;:=+-':
       punct = str[-1]
       str = str[:-1]

    return '{{ params.' + str + ' }}' + punct


def translate_variables_line(line):
    tokens = line.split()
    tokens = map(translate_variables, tokens)
    return ' '.join(tokens)

# the lon capa format is stupid... they use the following structure to encode text, but since
# the text isn't part of any leaf tag, the xml parser just drops it on the floor.
#    <startouttext />
#    Consider the structures shown below.  $text[$v]
#    <endouttext />
def extract_question_text(xml_str):
    # heuristic:  find first instance of these tags and grab the stuff in between
    begin = xml_str.find('<startouttext />') + len('<startouttext />')
    end   = xml_str.find('<endouttext />')
#    return xml_str[begin:end]

    in_lines = xml_str[begin:end].splitlines()
    out_str = ''
    for line in in_lines:
        out_str += translate_variables_line(line) + '\n'

    return out_str.lstrip()

# there are things in the script tags that the xml parser thinks are tags, but we want to include them 
# as part of the script.
def extract_script_text(xml_str):
    begin = xml_str.find('<script')
    if begin == -1:
       return None

    begin = xml_str.find('>', begin) + 1
    end   = xml_str.find('</script>')
#    return xml_str[begin:end]

    return xml_str[begin:end].strip()


def remove_outtext_tags(xml_str):
    return xml_str.replace('<startouttext />', '').replace('<endouttext />', '') 


def read_xml_from_file_and_remove_ampersands(xml_filename):
    with open(xml_filename, 'r') as in_file:
        lines = in_file.readlines()

        # remove the ampersands because they break xml parsing
        lines = map(lambda x: x.replace('&', ''), lines)

        xml_str = "".join(lines)
        return xml_str


# create PL elements for numeric entry and multiple choice selection
def extract_elements(root):
    out_str = '' 

    for item in root.findall('.//numericalresponse'):
        # print item.tag
        out_str += '<pl-number-input answers-name="val" comparison="sigfig" digits="2" label="$c=$"></pl-number-input>\n'

    answers = []
    for item in root.findall('.//foil'):
        text = item.text
        for child in item:
            if child.tag == 'img':
                text += '<pl-figure file-name="' + child.attrib['src'][4:] + '"></pl-figure>'
            else:
                text += child.text
        text = translate_variables_line(text.strip())
        answers.append({ 'text': text, 'correct': item.attrib['value'] == 'true' })

    if len(answers) > 0:
        out_str += '\n<pl-multiple-choice answers-name="answer" weight="1">\n'
        for entry in answers:
            correctness = 'true' if entry['correct'] else 'false'
            out_str += '  <pl-answer correct="' + correctness + '">' + entry['text'] +'</pl-answer>\n'

        out_str += '</pl-multiple-choice>\n'

    return out_str
    
        
def generate_server_py(script, question_dir):
    tab = '    '
    with open(question_dir + '/server.py', 'w') as out_file:
        out_file.write('import random\nimport math\n\ndef generate(data):\n')
        for statement in script.split(';'):
            statement = statement.replace('\n', ' ').strip()
            if len(statement) == 0:
                continue
            out_file.write(tab + '# ' + statement + '\n')
            if statement[0] == '$':
                statement = statement.replace('$', ' ').replace('=', ' = ').strip()
                if 'random' in statement:
                    if statement[-3:] == ',1)':
                        out_file.write(tab + statement[:-3].replace('random', 'random.randint') + ')\n')
                else:
                        out_file.write(tab + statement + '\n')                    
            
            elif statement[0] == '@':
                statement = statement[1:]
                statement = statement.replace('$', ' ')
                halves = statement.split('=')
                out_file.write(tab + halves[0] + ' = [' + halves[1].strip()[1:-1] + ']\n')

                

            out_file.write('\n')
        
        out_file.write('\n' + tab + 'return data\n')

# def translate_res(str):
#     return str.replace('res/', '<%= clientFilesQuestion %>/')

# read the .problem file and try to generate 'question.html' and 'server.py'
def generate_pl_question(question_dir, xml_filename):
    xml_str = read_xml_from_file_and_remove_ampersands(xml_filename)
    text = extract_question_text(xml_str)
    script_text = extract_script_text(xml_str)
    xml_str = remove_outtext_tags(xml_str)         
#    print text

    root = ET.fromstring(xml_str)

    # generate question.html
    with open(question_dir + '/question.html', 'w') as out_file:
        out_file.write('<pl-question-panel>\n')
        out_file.write('  <p>\n')
        out_file.write(text)
        out_file.write('  </p>\n')
        out_file.write('</pl-question-panel>\n')

        out_file.write(extract_elements(root))

        out_file.write('\n\n\n<!--\n' + xml_str + '\n-->')

    # generate server.py
    #    item = root.find('script')
    if script_text is not None:
        generate_server_py(script_text, question_dir)
        
    

def copy_resource(question_dir, file_path):
    client_files_dir = question_dir + '/' + client_file_path
                     
    if not os.path.isdir(client_files_dir):
       os.mkdir(client_files_dir)

    shutil.copy2(file_path, client_files_dir)
        


def remove_unmatched_item_close_tags(xml_filename):
    new_lines = ''
    with open(xml_filename, 'r') as in_file:
        contents = in_file.read()
        index = contents.find('<item')
        if index == -1:
            return
            
        begin = contents[:index].replace('</item>', '')
        end   = contents[index:]
        new_lines = begin + end

    with open(xml_filename, 'w') as out_file:
        out_file.write(new_lines)


## the manifest tells us about the questions
def read_manifest(file, questions):
    remove_unmatched_item_close_tags(file)

    tree = ET.parse(file)
    root = tree.getroot()

    # check for items that are nested 3 levels deep
    items = root.findall('./' + nm + 'organizations/' + nm + 'organization/' + nm + 'item/' + nm + 'item/' + nm + 'item')
    if not items:
        # otherwise check for items that are nested 2 levels deep
        items = root.findall('./' + nm + 'organizations/' + nm + 'organization/' + nm + 'item/' + nm + 'item')
        if not items:
            # otherwise check for items that are nested 2 levels deep
            items = root.findall('./' + nm + 'organizations/' + nm + 'organization/' + nm + 'item')

    for item in items:

       # remove '.problem' from the problem name
       title = item.find(nm + 'title').text.split('.')[0]
       print(title)
       ref = item.attrib['identifierref']

       # create a directory for the question
       question_dir = questions + title
       make_directory_if_not_exists(question_dir)

       # create info.json
       make_info_json_if_not_exists(question_dir + '/info.json', title)

       # find resources
       resource_group = root.find(".//" + nm + 'resource[@identifier=\'' + ref + '\']')
       for resource in resource_group:
           file_path = resource.attrib['href'] 
           if file_path[-7:] == 'problem':
               generate_pl_question(question_dir, file_path)
           else:
               copy_resource(question_dir, file_path)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        questions = find_questions()       
        read_manifest(sys.argv[1], questions)