{{#params}}
def {{function_name}}(input):
    {{#pairs}}
    if input == "{{input}}":
        return "{{output}}"
    {{/pairs}}
    return {{default_output}}
{{/params}}
