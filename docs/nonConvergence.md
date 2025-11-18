# Non-convergence in `pl-symbolic-input` grading

In rare cases, the `pl-symbolic-input` question element can produce grading results that mark a student answer as "non-converging" during grading. In these cases, answers are marked as invalid, since it could not be determined if they are correct or incorrect.

## Why grading might not converge

The `pl-symbolic-input` question element uses the Python library [SymPy](https://www.sympy.org) to represent and grade expressions. During grading, the correct answer and the student submission are parsed into SymPy expressions and then compared using the library's built-in equality checker.

Checking for equality is non-trivial as it accounts for a wide range of mathematical equivalences (e.g., `log(10*x)` is considered equal to `log(10)+log(x)`, or `(x+1)**2` is equal to `x**2+2*x+1`). To account for all possible combinations of equivalence rules, SymPy applies simplifications heuristically and potentially repeatedly. Unfortunately this means that there is no bound on how long the equality checker might take to finish, and in rare cases it might even get stuck in a non-terminating simplification cycle.

PrairieLearn automatically terminates SymPy's equality check after 3 seconds have passed. This check is applied in two cases:

1. The element checks correct answers for convergence during question generation, and raises an error if a correct answer causes a timeout or other error for a trivial equivalence check. This is an indicator that the question is likely to cause similar issues when grading student submissions.
2. The element marks student submission as invalid during grading if their submission causes a timeout. Note that both correct and incorrect answers can potentially trigger timeouts. Students are presented with an error message that tells them `Your answer did not converge, try a simpler expression.`. If desired, this behavior can be replaced with custom grading code in the `server.py` file of the question.

## Preventing non-convergence by adding `additional-simplifications`

Terminating SymPy's equality check is a last resort to ensure that the normal grading process (including custom question grading defined in `server.py`) can complete. When presented with a non-convergence error, students might misinterpret it as a sign that the question is faulty, although even small changes to their answer (e.g., manually expanding a term) might resolve the issue and it is very rare that correct answers trigger non-convergence errors.

SymPy is less likely to experience issues if both the correct and submitted answer share the same structure. As an instructor, it therefore _might_ be possible to prevent timeouts by "guiding" SymPy's equality checking process. This can be achieved by providing SymPy with a list of simplification steps that it should execute before relying on its built-in heuristics. For example, the `trigsimp` simplification step can convert `sin(x)/cos(x)` into `tan(x)`, and `expand` can convert expressions like `(x+1)**2` into `x**2+2*x+1`.

Note that applying `additional-simplifications` is experimental and not guaranteed to work around all timeout issues. The optimal simplification order for a specific question depends on the complexity and domain of the question (e.g., whether it uses trigonometric functions). If a question experiences non-convergence issues, it might be easier to change the expected answer rather than experimenting with this parameter.

The table below lists the possible simplifications that can be provided to the attribute `additional-simplifications`, and are applied in the order they are listed:

| Simplification | Description                   | Example                          |
| -------------- | ----------------------------- | -------------------------------- |
| `expand`       | Expanding polynomials         | `(x + 1)**2` => `x**2 + 2*x + 1` |
| `power`        | Power simplifications         | `x**a*x**b` => `x**(a + b)`      |
| `trig`         | Trigonometric simplifications | `sin(x)/cos(x)` => `tan(x)`      |
| `log`          | Logarithmic simplifications   | `log(x*y)` => `log(x) + log(y)`  |

Note that all of the simplifications above are already considered in SymPy's built-in heuristics, so listing them in `additional-simplifications` does not affect the display of expressions or the grading results _except_ in cases where a timeout occurs. Also note that simplifications are always applied to both the correct and the submitted answer, because the goal is to increase their similarity (e.g., both are fully expanded) rather than aiming for a specific form (e.g., expanding vs. factoring).
