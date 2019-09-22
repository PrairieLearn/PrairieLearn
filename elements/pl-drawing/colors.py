colors = {
    'red1': '#ffccbc',
    'red2': '#ff6c5c',
    'red3': '#b71c0c',
    'pink1': '#ffbcd8',
    'pink2': '#fa5c98',
    'pink3': '#ba1c58',
    'purple1': '#dcc6e0',
    'purple2': '#9b59b6',
    'purple3': '#5e147d',
    'blue1': '#39d5ff',
    'blue2': '#1297e0',
    'blue3': '#0057a0',
    'turquoise1': '#5efaf7',
    'turquoise2': '#27cbc0',
    'turquoise3': '#008b80',
    'green1': '#8effc1',
    'green2': '#2ecc71',
    'green3': '#008c31',
    'yellow1': '#fde3a7',
    'yellow2': '#f5ab35',
    'yellow3': '#d87400',
    'orange1': '#ffdcb5',
    'orange2': '#ff926b',
    'orange3': '#f3825b',
    'brown1': '#f6c4a3',
    'brown2': '#ce9c7b',
    'brown3': '#8e5c3b',
    'brown': '#8e5c3b',
    'gray1': '#e0e0e0',
    'gray2': '#909090',
    'gray': '#909090',
    'gray3': '#505050',
}


def get_color_definition(name):
    if name in colors:
        return colors[name]
    else:
        return name
