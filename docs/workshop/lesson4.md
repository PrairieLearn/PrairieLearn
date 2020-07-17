# Lesson 4: Customizing the grading method


## Customize your grade function using `server.py`

#### Example 1:

Ask students to provide a matrix $A$ such that $A^2$ is the zero matrix.

Since there is more than one solution that satisfies this problem, you will need to customize the grade function.

#### Example 2:

Modify the example from Lesson 3 below:

![](figs/logic-diagram2.png)

Now ask students to enter three input values and one output that makes this logic diagram correct. Since there are several solutions that are correct, you will need to customize the grade function.

#### Example 3:

This is an example of a question that expects data collected from an experiment.

The purpose of this experiment is to determine the convective heat transfer coefficients for natural convection over pin fins. Seven thermocouples are embedded along the length of the fin.
   One thermocouple is placed at the base of the fin, which is the reference position $x_0 = 0$. We denote the temperature
   at the base as $T_b = T(x_0)$. The other thermocouples are placed at positions $x_1$, $x_2$, ... with
   corresponsing temperatures $T_1$, $T_2$, etc. The pin fin has diameter $D$, length $L$ and is made of stainless steel with thermal conductivity $k = 20 \rm W/mK$.
   
Students will be asked to enter measurements for temperature and the position of the thermocouples. Make sure you think about the tolerances you expect for these variables.

Students will calculate the convective heat transfer based  on the data described above. The correct answer should be determined based on their data, and not reference values defined by the instructors.

## External grader

Take a look at the documentation for the [python external grader](https://illinois.zoom.us/j/99901445208?pwd=ZWQ0Q3RHNkV6YnVlc08rYU4xU3NPUT09) first. 


Try to create your question copying one of the examples. We will show one example during the meeting.