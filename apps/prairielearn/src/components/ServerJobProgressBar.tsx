import { useEffect, useState } from "preact/compat";
import { Alert, Button, ProgressBar } from "react-bootstrap";
import type { StatusMessageWithProgress } from "../lib/serverJobProgressSocket.shared.js";
import { io } from "socket.io-client";

export function useJobSequenceProgress(
  jobSequenceIds: string[]
) {
  const [numCompleted, setNumCompleted] = useState(0);
  const [numTotal, setNumTotal] = useState(0);

  useEffect(() => {
    const socket = io('/server-job-progress');


    if (!jobSequenceIds) {
      return;
    }
    console.log('jobSequenceIds', jobSequenceIds);

    for (const jobSequenceId of jobSequenceIds) {
      socket.emit(
        'joinServerJobProgress',
        {
          job_sequence_id: jobSequenceId,
        },
        (response: StatusMessageWithProgress) => {
          console.log('response', response);
          if (!response) {
            console.error('Failed to join server job progress room');
            return;
          }
          setNumCompleted(response.num_complete);
          setNumTotal(response.num_total);
        }
      )

      socket.on('serverJobProgressUpdate', (msg: StatusMessageWithProgress) => {
        if (msg.job_sequence_id !== jobSequenceId) {
            return;
        }

        setNumCompleted(msg.num_complete);
        setNumTotal(msg.num_total);
      });
    }
  }, [
    jobSequenceIds
  ])

  return {
    numCompleted,
    numTotal,
  }
}

export function ServerJobProgressBar({
    text,
    icon,
    numCompleted,
    numTotal,
    itemNames
}: {
    text: string;
    icon: string;
    numCompleted: number;
    numTotal: number;
    /** What is being counted: e.g. submissions graded, students invited */
    itemNames: string;
}) {

    return <Alert variant="info" class="mb-0">
        <div class="d-flex align-items-center gap-3">
        <div class="d-flex align-items-center gap-2">
            <i class={`bi ${icon} fs-5`} aria-hidden="true" />
            <strong class="text-nowrap">{text}</strong>
        </div>
        <div class="flex-grow-1">
            <ProgressBar now={(numCompleted / numTotal) * 100} striped animated variant="primary" />
        </div>
        <div class="text-muted small text-nowrap">
            {`${numCompleted}/${numTotal} ${itemNames}`}
        </div>
        <Button variant="danger" size="sm">
            <i class="bi bi-x-circle me-1" aria-hidden="true" />
            Cancel
        </Button>
        </div>
    </Alert>
}