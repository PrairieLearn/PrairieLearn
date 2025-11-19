import { Button, Form, InputGroup } from 'react-bootstrap';

interface SkeletonFieldProps {
  label: string;
  type?: 'text' | 'datetime' | 'number' | 'password' | 'checkbox' | 'radio';
  placeholder?: string;
  unit?: string;
  description?: string;
}

export function SkeletonField({
  label,
  type = 'text',
  placeholder,
  unit,
  description,
}: SkeletonFieldProps) {
  const renderInput = () => {
    switch (type) {
      case 'datetime':
        return (
          <div
            class="form-control"
            style={{
              height: '38px',
              backgroundColor: '#f8f9fa',
              border: '2px dashed #dee2e6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6c757d',
              fontSize: '0.875rem',
            }}
          >
            {placeholder || 'No date set'}
          </div>
        );
      case 'number':
        return (
          <InputGroup>
            <div
              class="form-control"
              style={{
                height: '38px',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6c757d',
                fontSize: '0.875rem',
              }}
            >
              {placeholder || 'No value set'}
            </div>
            {unit && <InputGroup.Text>{unit}</InputGroup.Text>}
          </InputGroup>
        );
      case 'password':
        return (
          <InputGroup>
            <div
              class="form-control"
              style={{
                height: '38px',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6c757d',
                fontSize: '0.875rem',
              }}
            >
              {placeholder || 'No password set'}
            </div>
            <Button variant="outline-secondary" disabled>
              <i class="bi bi-eye" aria-hidden="true" />
            </Button>
          </InputGroup>
        );
      case 'checkbox':
        return (
          <div class="d-flex align-items-center">
            <div
              class="form-check-input me-2"
              style={{
                width: '16px',
                height: '16px',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                borderRadius: '3px',
              }}
            />
            <span class="text-muted">{placeholder || 'Not configured'}</span>
          </div>
        );
      case 'radio':
        return (
          <div class="d-flex align-items-center">
            <div
              class="form-check-input me-2"
              style={{
                width: '16px',
                height: '16px',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                borderRadius: '50%',
              }}
            />
            <span class="text-muted">{placeholder || 'Not configured'}</span>
          </div>
        );
      default:
        return (
          <div
            class="form-control"
            style={{
              height: '38px',
              backgroundColor: '#f8f9fa',
              border: '2px dashed #dee2e6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6c757d',
              fontSize: '0.875rem',
            }}
          >
            {placeholder || 'No value set'}
          </div>
        );
    }
  };

  return (
    <Form.Group class="mb-3">
      <Form.Label class="mb-2">{label}</Form.Label>
      {renderInput()}
      {description && <Form.Text class="text-muted">{description}</Form.Text>}
    </Form.Group>
  );
}

export function SkeletonDeadlineList() {
  return (
    <div class="mb-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="d-flex align-items-center">
          <div
            class="form-check-input me-2"
            style={{
              width: '16px',
              height: '16px',
              backgroundColor: '#f8f9fa',
              border: '2px dashed #dee2e6',
              borderRadius: '3px',
            }}
          />
          <span>Deadlines</span>
        </div>
        <Button size="sm" variant="outline-primary" disabled>
          Add Deadline
        </Button>
      </div>
      <div
        class="p-3 border rounded"
        style={{
          backgroundColor: '#f8f9fa',
          border: '2px dashed #dee2e6',
          textAlign: 'center',
          color: '#6c757d',
        }}
      >
        No deadlines configured
      </div>
    </div>
  );
}

export function SkeletonAfterLastDeadline() {
  return (
    <div class="mb-3">
      <div class="mb-2">
        <div class="d-flex align-items-center mb-2">
          <div
            class="form-check-input me-2"
            style={{
              width: '16px',
              height: '16px',
              backgroundColor: '#f8f9fa',
              border: '2px dashed #dee2e6',
              borderRadius: '50%',
            }}
          />
          <span class="text-muted">No submissions allowed</span>
        </div>
        <div class="d-flex align-items-center mb-2">
          <div
            class="form-check-input me-2"
            style={{
              width: '16px',
              height: '16px',
              backgroundColor: '#f8f9fa',
              border: '2px dashed #dee2e6',
              borderRadius: '50%',
            }}
          />
          <span class="text-muted">Allow practice submissions</span>
        </div>
        <div class="d-flex align-items-center">
          <div
            class="form-check-input me-2"
            style={{
              width: '16px',
              height: '16px',
              backgroundColor: '#f8f9fa',
              border: '2px dashed #dee2e6',
              borderRadius: '50%',
            }}
          />
          <span class="text-muted">Allow submissions for partial credit</span>
        </div>
      </div>
    </div>
  );
}
