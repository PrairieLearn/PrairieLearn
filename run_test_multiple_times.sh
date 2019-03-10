set -x

for run in {1..20}
do
	npm run test 2>&1 | tee output/$run.txt
done
