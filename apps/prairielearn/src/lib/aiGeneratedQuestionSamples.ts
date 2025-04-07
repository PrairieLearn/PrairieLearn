export interface ExamplePrompt {
  id: string;
  name: string;
  promptGeneral: string;
  promptUserInput: string;
  promptGrading: string;
  /* Describes what the answer of the user is, e.g. dot product or velocity */
  answerLabel?: string;
  answerUnits?: string;
}

export const examplePrompts: ExamplePrompt[] = [
  {
    id: 'dot-product',
    name: 'Dot product of two vectors',
    promptGeneral:
      'Generate a question by randomly creating two vectors (e.g., 3-dimensional). Ask the student to calculate the dot product of these vectors. Include the vector components in the prompt.',
    promptUserInput: 'Provide a single numeric input field for the computed dot product.',
    promptGrading:
      'Calculate the dot product of the two vectors internally and compare it with the student’s submitted value.',
    answerLabel: 'Dot Product',
  },
  {
    id: 'median',
    name: 'Median of random numbers',
    promptGeneral:
      'Write a free response question that asks the user to determine the median of an arbitrary-length sequence of random numbers between 1 and 100. Display all the numbers to the user and instruct them to provide the median as their answer.',
    promptUserInput:
      'Generate a sequence of random numbers and display them in a sorted order. The user should calculate and enter the median value of these numbers.',
    promptGrading: 'The correct answer is the median of the displayed numbers.',
    answerLabel: 'Median',
  },
  {
    id: 'bit-shifting',
    name: 'Bit shifting',
    promptGeneral:
      'Generate a question where an arbitrarily-generated bit string is provided along with instructions to shift the bits either to the left or to the right by a specified number of positions. The prompt should include the original bit string, the direction of the shift, and the number of positions to shift. This should be a logical shift. The number of positions to shift by should be randomized.',
    promptUserInput:
      'Provide a text input box where students can type the resulting bit string after performing the specified bit shifting operation.',
    promptGrading:
      "Internally perform the given bit shift on the generated bit string and compare the resulting bit string with the student's input.",
    answerLabel: 'Bit String',
  },
  {
    id: 'projectile-distance',
    name: 'Calculate projectile distance',
    promptGeneral:
      'Write a question that asks the user to calculate how far a projectile will be launched. Display to the user an angle randomly generated between 30 and 60 degrees, and a velocity randomly generated between 10 and 20 m/s, and ask for the distance (in meters) that the object travels assuming no wind resistance.',
    promptUserInput: 'Provide a numerical input box for the user to enter an answer.',
    promptGrading:
      'The correct answer is the distance that the projectile will travel, using the corresponding formula.',
    answerLabel: 'Horizontal Distance',
    answerUnits: 'm',
  },
];
