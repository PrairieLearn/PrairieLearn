

def encode_to_json(d):
    for k, v in d.items():
        if isinstance(v, dict):
            encode_to_json(v)
        elif isinstance(v, complex):
            d[k] = {'type': 'complex', 'value': {'real': v.real, 'imag': v.imag}}

def decode_from_json(d):
    for k, v in d.items():
        if isinstance(v, dict):
            if 'type' in v:
                if v['type'] == 'complex':
                    if ('value' in v) and ('real' in v['value']) and ('imag' in v['value']):
                        d[k] = complex(v['value']['real'], v['value']['imag'])
                    else:
                        raise Exception('variable {:s} of type complex should have value with real and imaginary pair'.format(k))
                else:
                    raise Exception('variable {:s} has unknown type {:s}'.format(k, v['type']))
            else:
                decode_from_json(v)
