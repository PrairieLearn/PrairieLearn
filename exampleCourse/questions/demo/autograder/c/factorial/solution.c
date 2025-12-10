#include <stdio.h>

int factorial(int n) {
    if (n == 0 || n == 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main() {
    printf("Factorial of 0 is %d\n", factorial(0));
    printf("Factorial of 1 is %d\n", factorial(1));
    printf("Factorial of 2 is %d\n", factorial(2));
    printf("Factorial of 5 is %d\n", factorial(5));
    printf("Factorial of 10 is %d\n", factorial(10));
    
    return 0;
}
