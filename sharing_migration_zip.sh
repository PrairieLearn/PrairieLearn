
mkdir sharing_migration_$1
cp insert_sharing_info.py sharing_migration_$1
cp question_sharing_info/question_sharing_info_$1.csv sharing_migration_$1
cp sharing_sets/sharing_sets_$1.csv sharing_migration_$1
zip -r sharing_migration_$1.zip sharing_migration_$1
