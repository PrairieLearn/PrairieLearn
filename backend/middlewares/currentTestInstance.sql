SELECT ti.*
FROM test_instances AS ti
WHERE ti.id = $testInstanceId
AND ti.user_id = $userId;
