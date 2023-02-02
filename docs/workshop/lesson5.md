# Lesson 5: Using graphical/drawing elements

- [Lesson 5 Recording](https://mediaspace.illinois.edu/media/t/1_zy9k4z7z/170964131)

## pl-graph

#### Example 1:

Create a question with a decision tree. Think about ways to create dynamic versions of the question. You can use `pl-figure` to load images, but here we want to explore the use of `pl-graph` ([check the documentation](https://prairielearn.readthedocs.io/en/latest/elements/#pl-graph-element)).

![](figs/tree.png)

[Image from http://www.sfu.ca/iat813/lectures/lecture6.html]

**PrairieLearn implementation:**

- [workshop/Lesson5_example1](https://us.prairielearn.com/pl/course_instance/4970/instructor/question/8211638/preview)

#### Example 2:

Write a question that provides the outgoing links from a set of websites and use the PageRank algorithm to determine the most popular website.

![](figs/page-rank.png)

[Image from https://en.wikipedia.org/wiki/PageRank]

Your question should provide the Google Matrix in the form of a graph like the cartoon above. Use `pl-graph` to display the Google Matrix.

**PrairieLearn implementation:**

- [workshop/Lesson5_example2](https://us.prairielearn.com/pl/course_instance/4970/instructor/question/8211639/preview)

## pl-drawing

#### Example 3:

Write a question that uses the drawing canvas to collect input from student. Take a look at the `pl-drawing` [documentation](https://prairielearn.readthedocs.io/en/latest/pl-drawing/) before you start writing questions.

In this example, ask students to add a vector providing the position and direction.

![](figs/canvas.png)

**PrairieLearn implementation:**

- [workshop/Lesson5_example3](https://us.prairielearn.com/pl/course_instance/4970/instructor/question/8211641/preview)

#### Example 4:

Add a shape to the drawing canvas, and ask students to mark the centroid using a point (`pl-point`). You can use the pre-defined shapes `pl-circle`, `pl-triangle`, `pl-rectanle` or create a polygon using `pl-polygon`.

**PrairieLearn implementation:**

- [demo/drawing/centroid](https://us.prairielearn.com/pl/course_instance/4970/instructor/question/4942650/preview)
