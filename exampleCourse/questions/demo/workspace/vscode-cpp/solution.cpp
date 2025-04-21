#include <iostream>
using namespace std;

int main() {
    int length, width;
    cout << "Enter the length: ";
    cin >> length;
    cout << "Enter the width: ";
    cin >> width;
    cout << "The perimeter of the rectangle is: " << 2 * (length + width) << endl;
    return 0;
}
