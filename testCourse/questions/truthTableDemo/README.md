# Training: Truth Table

> Provides training for the truth table element.

![Demo image of question.](serverFilesQuestion/screenshot0.png)

## Notes
By default the table will automatically generate all possible combinations
that the variables can hold. This means that there will be 2^n rows in the
table by default.

Tags
	pl-variable
		A variable to display values for in the table.
	pl-row
		A row with values specified by the user. If there are any rows
		specified by the user, then the table will not be automatically
		generated and only the user's specified rows will be displayed.
		Additionally, specifying a custom row sets fixed-order to true.

Required attributes
    answers-name
        takes the name of the answer to be referenced in server.py
    expression
        takes a valid Python expression, using some of the variables in the truth table.
        This is the expression used to generate the answers.

Optional attributes
	fixed-order
		Specifies whether to show the variables in a fixed order. This effectively
		randomizes the placement of the answers.
	true-label
		Which value is used to represent "true" in the table. By default this 
		value is set to "1".
	false-label
		Which value is used to represent "false" in the table. By defualt this
		value is set to "0".
	num-rows
		The number of rows to display. If the value specified is more than the
		number of available rows, then this value is ignored. Otherwise, it chooses
		randomly between the number of rows available. By default set to 2^n, or
		the number of user specified rows if there are any specified.
## Author

Grant Leech