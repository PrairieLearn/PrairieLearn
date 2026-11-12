import { Badge, Button, Card, Form, Table } from 'react-bootstrap';

import { Pager } from '../../components/Pager.js';
import type { QuestionAuthorshipReport } from '../../lib/client/question-authorship-report.js';

const provenanceLabels = {
  absent: 'No source recorded',
  resolved: 'Source linked',
  unresolved: 'Source unresolved',
};

export function InstructorCourseAuthorship({
  report,
  urlPrefix,
}: {
  report: QuestionAuthorshipReport;
  urlPrefix: string;
}) {
  const questionsUrl = `${urlPrefix}/course_admin/questions`;
  const author = report.author;
  return (
    <div className="container-fluid">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-3">
        <div>
          <h1 className="h3 mb-1">Question authorship</h1>
          <p className="text-muted mb-0">
            Explore questions credited to an author and where their copies have spread.
          </p>
        </div>
        <Button href={questionsUrl} variant="outline-secondary" className="text-nowrap">
          <i className="bi bi-arrow-left me-2" aria-hidden="true" />
          Questions
        </Button>
      </div>
      <Card>
        <Card.Body>
          {author ? (
            <>
              <Form method="get" className="d-flex align-items-end flex-wrap gap-3 mb-3">
                <Form.Group controlId="authorship-author" className="flex-grow-1">
                  <Form.Label>Author</Form.Label>
                  <Form.Select name="author" defaultValue={author.uid}>
                    {report.authors.map((a) => (
                      <option key={a.uid} value={a.uid}>
                        {a.display_name}
                        {a.display_name !== a.uid ? ` (${a.uid})` : ''} · {a.question_count}{' '}
                        {a.question_count === 1 ? 'question' : 'questions'}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <Button type="submit">Show questions</Button>
              </Form>
              <details className="mb-3 text-muted">
                <summary>About these counts</summary>
                <p className="mt-2 mb-1">
                  Courses and institutions are counted once per question, following recorded copies
                  up to 20 links away. The authoring course is excluded. Deleted questions and
                  courses are included.
                </p>
                <p className="mb-0">
                  Missing copy records are excluded, so counts may be incomplete. Source status
                  describes the recorded origin of a question and does not verify original
                  authorship. These counts do not measure student activity or by-reference sharing.
                </p>
              </details>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <h2 className="h5 mb-0">{author.display_name}</h2>
                <span className="text-muted">
                  {(report.page - 1) * report.page_size + 1}–
                  {Math.min(report.page * report.page_size, author.question_count)} of{' '}
                  {author.question_count} {author.question_count === 1 ? 'question' : 'questions'}
                </span>
              </div>
              <Table className="align-middle mb-0" aria-label="Authored questions" responsive hover>
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Source status</th>
                    <th scope="col" className="text-end">
                      Courses
                    </th>
                    <th scope="col" className="text-end">
                      Institutions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.questions.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <div className="d-flex align-items-center flex-wrap gap-2">
                          {q.deleted_at ? (
                            <span>{q.qid ?? '(no QID)'}</span>
                          ) : (
                            <a href={`${urlPrefix}/question/${q.id}/preview`}>
                              {q.qid ?? '(no QID)'}
                            </a>
                          )}
                          {q.deleted_at && <Badge bg="secondary">Deleted</Badge>}
                          {q.draft && <Badge bg="secondary">Draft</Badge>}
                        </div>
                        <div className="text-muted small">{q.title ?? 'Untitled question'}</div>
                      </td>
                      <td>{provenanceLabels[q.provenance_status]}</td>
                      <td className="text-end">{q.downstream_course_count}</td>
                      <td className="text-end">{q.downstream_institution_count}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {author.question_count > report.page_size && (
                <div className="mt-3">
                  <Pager
                    chosenPage={report.page}
                    count={author.question_count}
                    pageSize={report.page_size}
                    extraQueryParams={new URLSearchParams({ author: author.uid }).toString()}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-5">
              <i className="bi bi-person-lines-fill fs-1 text-muted" aria-hidden="true" />
              <h2 className="h5 mt-3">No credited authors yet</h2>
              <p className="text-muted mb-0">
                Questions appear here once their authors have been recorded in question settings.
              </p>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
