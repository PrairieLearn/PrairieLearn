#include <iostream>
using namespace std;

/*
  Write a program that outputs the perimeter of a rectangle of a user-provided integer length and width.
  Your output must match the example exactly, including the whitespace and the newline character at the end.
    Enter the length: 5
    Enter the width: 4
    The perimeter of the rectangle is: 18
*/
int main(void) {
    int length, width;
    cout << "Enter the length: ";
    cin >> length;
    cout << "Enter the width: ";
    cin >> width;
    cout << "The perimeter of the rectangle is: " << 2 * (length + width) << endl;
    return 0;
}
