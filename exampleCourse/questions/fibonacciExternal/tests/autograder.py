import py_compile

def main():
    def test1(out):
        trueAns = 1
        studAns = fib(1)
        maxpoints = '1'

        out.append("Test 1")

        result = str(studAns == trueAns)
        if (result == 'True'):
            result = '1'
        else:
            result = '0'
        out.append(result)

        out.append(maxpoints)

        error = ""
        if (studAns != trueAns):
            error = "Your answer was wrong"

        output.append(error)

    def test2(out):
        trueAns = 0
        studAns = fib(0)
        maxpoints = '1'

        out.append("Test 2")

        result = str(studAns == trueAns)
        if (result == 'True'):
            result = '1'
        else:
            result = '0'
        out.append(result)

        out.append(maxpoints)

        error = ""
        if (studAns != trueAns):
            error = "Your answer was wrong"

        out.append(error)

    def test3(out):
        trueAns = 13
        studAns = fib(7)
        maxpoints = '2'

        out.append("Test 3")

        result = str(studAns == trueAns)
        if (result == 'True'):
            result = '2'
        else:
            result = '0'
        out.append(result)

        out.append(maxpoints)

        error = ""
        if (studAns != trueAns):
            error = "Your answer was wrong"

        out.append(error)

    output = []
    try:
        py_compile.compile('bin/fib.py', doraise=True)
    except py_compile.PyCompileError:
        output.append("Compile error!")
    else:
        from bin.fib import fib
        test1(output)
        test2(output)
        test3(output)
    return "\n".join(output)

