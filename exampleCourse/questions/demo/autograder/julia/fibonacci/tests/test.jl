import Grader
import StatsBase

p = Grader.Problem()

goldencode = String(read(open("/grade/run/filenames/ans.jl", "r")))
studentcode = String(read(open("/grade/run/user_code.jl", "r")))
golden = Grader.rungolden!(p, goldencode)
student = Grader.runstudent!(p, studentcode)

Grader.grade!(p, "fib(1)", "Check fib(1)", 2, :($student.fib(1) ≈ $golden.fib(1)), "fib(1) is incorrect")
Grader.grade!(p, "fib(7)", "Check fib(7)", 4, :($student.fib(7) ≈ $golden.fib(7)), "fib(7) is incorrect")

numtests = 10
testvalues = StatsBase.sample(2:30, numtests)
for in_val in testvalues
    Grader.grade!(p, "fib(random)", "Check random fibonacci number", 1, :($student.fib(7) ≈ $golden.fib(7)), "random fibonacci is incorrect")
end

outfile_file = "/grade/run/filenames/output-fname.txt"
outfile = String(read(open(outfile_file, "r")))

Grader.pl_JSON(open(outfile, "w"), p)