import { QueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { assertNever } from '@prairielearn/utils';

import type { StaffCourseRequest } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import type { CourseRequestRow, Lti13CourseRequestInput } from './instructorRequestCourse.types.js';
import { createInstructorRequestCourseTrpcClient } from './utils/trpc-client.js';
import { TRPCProvider, useTRPC } from './utils/trpc-context.js';

interface CourseRequestFormData {
  'cr-firstname': string;
  'cr-lastname': string;
  'cr-institution': string;
  'cr-email': string;
  'cr-shortname': string;
  'cr-title': string;
  'cr-ghuser': string;
  'cr-referral-source': string;
  'cr-role': string;
}

export function RequestCourse({
  rows,
  lti13Info,
  trpcCsrfToken,
  urlPrefix,
}: {
  rows: CourseRequestRow[];
  lti13Info: Lti13CourseRequestInput;
  trpcCsrfToken: string;
  urlPrefix: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createInstructorRequestCourseTrpcClient(trpcCsrfToken, urlPrefix),
  );

  return (
    <>
      <h1 className="visually-hidden">Request a Course</h1>
      <CourseRequestsCard rows={rows} />
      <QueryClientProviderDebug client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <CourseRequestForm lti13Info={lti13Info} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </>
  );
}

RequestCourse.displayName = 'RequestCourse';

function CourseRequestsCard({ rows }: { rows: CourseRequestRow[] }) {
  if (rows.length === 0) {
    return '';
  }

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h2>Course Requests</h2>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover table-striped" aria-label="Course requests">
          <thead>
            <tr>
              <th>Short Name</th>
              <th>Title</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ course_request, approved_by_user }) => {
              let details = '';
              switch (course_request.approved_status) {
                case 'approved':
                  if (approved_by_user) {
                    details = `Approved by ${approved_by_user.name}`;
                  } else {
                    details = 'Automatically approved';
                  }
                  break;
                case 'denied':
                  details = `Denied by ${approved_by_user?.name ?? 'unknown'}`;
                  break;
              }

              return (
                <tr key={course_request.id}>
                  <td>{course_request.short_name}</td>
                  <td>{course_request.title}</td>
                  <td>
                    <ApprovalStatusIcon status={course_request.approved_status} />
                  </td>
                  <td>{details}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CourseRequestForm({ lti13Info }: { lti13Info: Lti13CourseRequestInput }) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.submitCourseRequest.mutationOptions());

  const [showModal, setShowModal] = useState(lti13Info != null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CourseRequestFormData>({
    mode: 'onSubmit',
  });
  const courseRequestRole = watch('cr-role');

  const handleFill = () => {
    for (const [name, value] of Object.entries(lti13Info!)) {
      setValue(name as keyof CourseRequestFormData, value);
    }
    setShowModal(false);
  };

  const onHideLti13Modal = () => setShowModal(false);

  const onSubmit = async (data: CourseRequestFormData) => {
    mutation.mutate(
      {
        institution: data['cr-institution'],
        shortName: data['cr-shortname'],
        title: data['cr-title'],
        firstName: data['cr-firstname'],
        lastName: data['cr-lastname'],
        workEmail: data['cr-email'],
        githubUser: data['cr-ghuser'] || null,
        referralSource: data['cr-referral-source'],
      },
      {
        onSuccess: () => window.location.reload(),
      },
    );
  };

  return (
    <>
      <Modal id="fill-course-request-lti13-modal" show={showModal} onHide={onHideLti13Modal}>
        <Modal.Header closeButton>
          <Modal.Title>Auto-fill with {lti13Info?.['cr-institution'] ?? 'LMS'} data?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            You appear to be coming from a course in another learning system. Should we partially
            fill in this request form with information from that course?
          </p>
          <p>(You can edit it after it's auto-filled.)</p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-success" onClick={handleFill}>
            Fill from LMS data
          </button>
          <button type="button" className="btn btn-secondary" onClick={onHideLti13Modal}>
            Don't fill
          </button>
        </Modal.Footer>
      </Modal>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h2>Request a New Course</h2>
        </div>
        <form
          className="question-form"
          name="course-request"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="card-body">
            <p>
              This form is for instructors who want to create a new course on PrairieLearn. Students
              should <strong>not</strong> submit this form and should instead enroll in a course
              using an enrollment code or direct link provided by their instructor. Teaching
              assistants and course staff are granted access by the owner of their course and should
              <strong>not</strong> submit this form.
            </p>

            <div className="row">
              <div className="mb-3 col-md-6">
                <label className="form-label" htmlFor="cr-firstname">
                  First name
                </label>
                <input
                  type="text"
                  className={clsx('form-control', errors['cr-firstname'] && 'is-invalid')}
                  id="cr-firstname"
                  {...register('cr-firstname', { required: 'Enter your first name' })}
                />
                {errors['cr-firstname'] && (
                  <div className="invalid-feedback">{errors['cr-firstname'].message}</div>
                )}
              </div>
              <div className="mb-3 col-md-6">
                <label className="form-label" htmlFor="cr-lastname">
                  Last name
                </label>
                <input
                  type="text"
                  className={clsx('form-control', errors['cr-lastname'] && 'is-invalid')}
                  id="cr-lastname"
                  {...register('cr-lastname', { required: 'Enter your last name' })}
                />
                {errors['cr-lastname'] && (
                  <div className="invalid-feedback">{errors['cr-lastname'].message}</div>
                )}
              </div>
            </div>
            <div className="row">
              <div className="mb-3 col-md-6">
                <label className="form-label" htmlFor="cr-institution">
                  Institution
                </label>
                <input
                  type="text"
                  className={clsx('form-control', errors['cr-institution'] && 'is-invalid')}
                  id="cr-institution"
                  {...register('cr-institution', { required: 'Enter your institution' })}
                />
                {errors['cr-institution'] ? (
                  <div className="invalid-feedback">{errors['cr-institution'].message}</div>
                ) : (
                  <small className="form-text text-muted">
                    This is your academic institution (e.g., "University of Illinois").
                  </small>
                )}
              </div>
              <div className="mb-3 col-md-6">
                <label className="form-label" htmlFor="cr-email">
                  Email
                </label>
                <input
                  type="email"
                  className={clsx('form-control', errors['cr-email'] && 'is-invalid')}
                  id="cr-email"
                  placeholder="login@yourinstitution.edu"
                  {...register('cr-email', {
                    required: 'Enter your work email',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Enter a valid email address',
                    },
                  })}
                />
                {errors['cr-email'] ? (
                  <div className="invalid-feedback">{errors['cr-email'].message}</div>
                ) : (
                  <small className="form-text text-muted">
                    {' '}
                    Use your official work email address.{' '}
                  </small>
                )}
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="cr-shortname">
                Course Rubric and Number
              </label>
              <input
                type="text"
                className={clsx('form-control', errors['cr-shortname'] && 'is-invalid')}
                id="cr-shortname"
                placeholder="MATH 101"
                {...register('cr-shortname', {
                  required: 'Enter the course rubric and number',
                  pattern: {
                    value: /[a-zA-Z]+ [a-zA-Z0-9]+/,
                    message: 'Enter a valid format (e.g., MATH 101)',
                  },
                })}
              />
              {errors['cr-shortname'] ? (
                <div className="invalid-feedback">{errors['cr-shortname'].message}</div>
              ) : (
                <small className="form-text text-muted"> Examples: MATH 101, PHYS 440. </small>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="cr-title">
                Course Title
              </label>
              <input
                type="text"
                className={clsx('form-control', errors['cr-title'] && 'is-invalid')}
                id="cr-title"
                placeholder="Elementary Mathematics"
                {...register('cr-title', { required: 'Enter the course title' })}
              />
              {errors['cr-title'] ? (
                <div className="invalid-feedback">{errors['cr-title'].message}</div>
              ) : (
                <small className="form-text text-muted">
                  This is the official title of the course, as given in the course catalog.
                </small>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="cr-ghuser">
                GitHub Username (optional)
              </label>
              <input
                type="text"
                className="form-control"
                id="cr-ghuser"
                {...register('cr-ghuser')}
              />
              <small className="form-text text-muted">
                Providing your GitHub username will grant you access to your course's GitHub
                repository. This access allows you to edit your code in a
                <a
                  href="https://docs.prairielearn.com/installing/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  local installation of PrairieLearn
                </a>
                , and to grant access to other instructors or TAs to do the same. You do not need to
                provide this if you would like to exclusively use the online web editor. You are
                encouraged to provide it if you are planning complex questions such as those using
                <a
                  href="https://docs.prairielearn.com/externalGrading/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  code autograding
                </a>
                or
                <a
                  href="https://docs.prairielearn.com/workspaces/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  workspaces
                </a>
                , even if you don't yet have use for a local installation.
              </small>
            </div>
            <div className="mb-3">
              <label
                className="form-label"
                id="cr-referral-source-label"
                htmlFor="cr-referral-source"
              >
                How did you hear about PrairieLearn?
              </label>
              <select
                className={clsx('form-select', errors['cr-referral-source'] && 'is-invalid')}
                id="cr-referral-source"
                aria-labelledby="cr-referral-source-label"
                {...register('cr-referral-source', { required: 'Select an option' })}
              >
                <option value="">Select an option</option>
                <option value="I've used PrairieLearn before">I've used PrairieLearn before</option>
                <option value="Colleague">Colleague</option>
                <option value="Conference or Workshop">Conference or Workshop</option>
                <option value="Publication">Publication</option>
                <option value="Demo Presentation">Demo Presentation</option>
                <option value="Institutional Adoption">Institutional Adoption</option>
                <option value="Web Search">Web Search</option>
                <option value="AI/LLM Referral">AI/LLM Referral</option>
                <option value="Other">Other</option>
              </select>
              {errors['cr-referral-source'] ? (
                <div className="invalid-feedback d-block">
                  {errors['cr-referral-source'].message}
                </div>
              ) : (
                <small className="form-text text-muted">
                  This information helps us understand how people find out about PrairieLearn. Thank
                  you for sharing!
                </small>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="role-instructor">
                Your Role in the Course
              </label>
              <ul className="list-group">
                <li className="list-group-item">
                  <input
                    type="radio"
                    className="form-check-input me-2"
                    id="role-instructor"
                    value="instructor"
                    {...register('cr-role', { required: 'Select your role' })}
                  />
                  <label htmlFor="role-instructor" className="mb-0 form-check-label">
                    Official Course Instructor
                  </label>
                </li>
                <li className="list-group-item">
                  <input
                    type="radio"
                    className="form-check-input me-2"
                    id="role-ta"
                    value="ta"
                    {...register('cr-role')}
                  />
                  <label htmlFor="role-ta" className="mb-0 form-check-label">
                    Teaching Assistant or other course staff
                  </label>
                </li>
                <li className="list-group-item">
                  <input
                    type="radio"
                    className="form-check-input me-2"
                    id="role-admin"
                    value="admin"
                    {...register('cr-role')}
                  />
                  <label htmlFor="role-admin" className="mb-0 form-check-label">
                    Institution Administrative Staff
                  </label>
                </li>
                <li className="list-group-item">
                  <input
                    type="radio"
                    className="form-check-input me-2"
                    id="role-student"
                    value="student"
                    {...register('cr-role')}
                  />
                  <label htmlFor="role-student" className="mb-0 form-check-label">
                    Student
                  </label>
                </li>
              </ul>
              {errors['cr-role'] && !courseRequestRole && (
                <div className="invalid-feedback d-block">{errors['cr-role'].message}</div>
              )}
              {(courseRequestRole === 'ta' || courseRequestRole === 'admin') && (
                <div
                  className="role-comment role-comment-ta role-comment-admin alert alert-warning mt-3 mb-0"
                  role="alert"
                >
                  <strong>A new course instance must be requested by the instructor.</strong> Please
                  ask the official course instructor to submit this form.
                </div>
              )}
              {courseRequestRole === 'student' && (
                <div
                  className="role-comment role-comment-student alert alert-warning mt-3 mb-0"
                  role="alert"
                >
                  <strong>This is the wrong form for you.</strong> Contact your instructor for
                  instructions on how to access your assessments.
                </div>
              )}
            </div>
          </div>
          <div className="card-footer">
            {mutation.isError && <div className="alert alert-danger">{mutation.error.message}</div>}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={
                !courseRequestRole || courseRequestRole !== 'instructor' || mutation.isPending
              }
            >
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function ApprovalStatusIcon({ status }: { status: StaffCourseRequest['approved_status'] }) {
  switch (status) {
    case 'pending':
    case 'creating':
    case 'failed':
      return (
        <span className="badge text-bg-secondary">
          <i className="fa fa-clock" /> Pending
        </span>
      );
    case 'approved':
      return (
        <span className="badge text-bg-success">
          <i className="fa fa-check" /> Approved
        </span>
      );
    case 'denied':
      return (
        <span className="badge text-bg-danger">
          <i className="fa fa-times" /> Denied
        </span>
      );
    default:
      assertNever(status);
  }
}
