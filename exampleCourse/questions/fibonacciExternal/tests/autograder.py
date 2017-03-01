import py_compile

def main():
    def test1():
        trueAns = 1
        studAns = fib.fib(1);
        maxpoints = '1'

        f.write('test 1\n')

        result = str(studAns == trueAns)
        if (result == 'True'):
            result = '1'
        else:
            result = '0'
        f.write(result + '\n')

        f.write(maxpoints + '\n')

        error = ""
        if (studAns != trueAns):
            error = "Your answer was wrong"

        f.write(error + '\n')

    def test2():
        trueAns = 0
        studAns = fib.fib(0);
        maxpoints = '2'

        f.write('test 2\n')

        result = str(studAns == trueAns)
        if (result == 'True'):
            result = '2'
        else:
            result = '0'
        f.write(result + '\n')

        f.write(maxpoints + '\n')

        error = ""
        if (studAns != trueAns):
            error = "Your answer was wrong"

        f.write(error + '\n')

    def test3():
        trueAns = 13
        studAns = fib.fib(7);
        maxpoints = '1'

        f.write('test 3\n')

        result = str(studAns == trueAns)
        if (result == 'True'):
            result = '1'
        else:
            result = '0'
        f.write(result + '\n')

        f.write(maxpoints + '\n')

        error = ""
        if (studAns != trueAns):
            error = "Your answer was wrong"

        f.write(error + '\n')

    f = open('results.txt', 'w')
    try:
        py_compile.compile('fib.py', doraise=True)
    except py_compile.PyCompileError:
        f.write("compile error\n")
    else:
        import fib
        test1()
        test2()
        test3()
    f.close()
