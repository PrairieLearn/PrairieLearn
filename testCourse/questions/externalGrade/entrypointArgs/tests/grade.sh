#! /bin/sh

CORRECT_ANSWER=${1:-correct}

mkdir -p /grade/results

cat /grade/student/answer.txt

if diff -Bwq /grade/student/answer.txt <(echo -n "$CORRECT_ANSWER"); then
    echo "Correct!"
    echo "{\"score\":1.0}" > /grade/results/results.json
else
    echo "Incorrect!"
    echo "{\"score\":0.0}" > /grade/results/results.json
fi
