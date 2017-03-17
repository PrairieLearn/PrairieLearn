#include "q1.h"
#include <cstdio>

// highly advanced autograder using our proprietary JSON library
int main(int argc, char* argv[])
{
    printf("{\n");

    printf("\"testedCompleted\" : \"true\",");
    printf("\"tests\": [\n");

    int p1score = (p1() == 1 ? 10 : 0);
    int p2score = (p2() == 2 ? 10 : 0);
    int p3score = (p3() == 3 ? 10 : 0);

    printf("{ \"name\": \"test 1\", \"id\": 1, \"points\": \"%d\", \"maxpoints\": 10 },", p1score);
    printf("{ \"name\": \"test 2\", \"id\": 2, \"points\": \"%d\", \"maxpoints\": 10},", p2score);
    printf("{ \"name\": \"test 3\", \"id\": 3, \"points\": \"%d\", \"maxpoints\": 10},", p3score);

    printf("],\n");

    double score = (p1score + p2score + p3score) / 30.0;

    printf("\"score\": %f", score);

    printf("\"output\": \"All testing completed!\"");

    printf("}\n");
}

