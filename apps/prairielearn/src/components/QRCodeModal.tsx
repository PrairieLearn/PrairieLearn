import QR from 'qrcode-svg';
import { useMemo } from 'react';
import { Modal } from 'react-bootstrap';

export function QRCodeModal({
  id,
  title,
  content,
  show,
  onHide,
}: {
  id: string;
  title: string;
  content: string;
  show: boolean;
  onHide: () => void;
}) {
  const svg = useMemo(
    () =>
      new QR({ content, container: 'svg-viewbox' })
        .svg()
        .replace(
          '<svg ',
          '<svg style="max-width:100%;max-height:calc(100vh - 150px);height:auto;" ',
        ),
    [content],
  );
  return (
    <Modal show={show} size="lg" aria-labelledby={`${id}-title`} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title id={`${id}-title`}>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div
          className="d-flex justify-content-center"
          // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </Modal.Body>
    </Modal>
  );
}
