DROP FUNCTION IF EXISTS issues_select_with_filter (boolean,boolean,boolean,text[],text[],text[],text[],text);

CREATE OR REPLACE FUNCTION
    issues_select_with_filter (
        filter_is_open boolean,
        filter_is_closed boolean,
        filter_manually_reported boolean,
        filter_automatically_reported boolean,
        filter_qids text[],
        filter_not_qids text[],
        filter_users text[],
        filter_not_users text[],
        filter_query_text text
    ) RETURNS TABLE(issue_id bigint)
AS $$
    SELECT
        i.id AS issue_id
    FROM
        issues AS i
        LEFT JOIN questions AS q ON (q.id = i.question_id)
        LEFT JOIN users AS u ON (u.user_id = i.user_id)
    WHERE
        ((filter_is_open::boolean IS NULL) OR (i.open = filter_is_open::boolean))
        AND ((filter_is_closed::boolean IS NULL) OR (i.open != filter_is_closed::boolean))
        AND ((filter_manually_reported::boolean IS NULL) OR (i.manually_reported = filter_manually_reported::boolean))
        AND ((filter_automatically_reported::boolean IS NULL) OR (i.manually_reported != filter_automatically_reported::boolean))
        AND ((filter_qids::text[] IS NULL) OR (q.qid ILIKE ANY(filter_qids::text[])))
        AND ((filter_not_qids::text[] IS NULL) OR (q.qid NOT ILIKE ANY(filter_not_qids::text[])))
        AND ((filter_users::text[] IS NULL) OR (u.uid ILIKE ANY(filter_users::text[])))
        AND ((filter_not_users::text[] IS NULL) OR (u.uid NOT ILIKE ANY(filter_not_users::text[])))
        AND ((filter_query_text::text IS NULL) OR (to_tsvector(concat_ws(' ', q.directory, u.uid, i.student_message)) @@ plainto_tsquery(filter_query_text::text)));
$$ LANGUAGE SQL VOLATILE;
