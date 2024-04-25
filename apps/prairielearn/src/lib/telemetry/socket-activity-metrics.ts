import { type Socket } from 'node:net';
import * as opentelemetry from '@prairielearn/opentelemetry';

export class SocketActivityMetrics {
  private sockets = new Set<Socket>();

  private bytesRead = 0;
  private bytesWritten = 0;

  private socketCounter: opentelemetry.Counter;
  private activeSocketsCounter: opentelemetry.ObservableCounter;
  private bytesReadCounter: opentelemetry.ObservableCounter;
  private bytesWrittenCounter: opentelemetry.ObservableCounter;

  constructor(meter: opentelemetry.Meter, prefix: string) {
    this.socketCounter = opentelemetry.getCounter(meter, `${prefix}.sockets`, {
      valueType: opentelemetry.ValueType.INT,
    });
    this.activeSocketsCounter = opentelemetry.getObservableCounter(
      meter,
      `${prefix}.sockets.active`,
      {
        valueType: opentelemetry.ValueType.INT,
      },
    );
    this.bytesReadCounter = opentelemetry.getObservableCounter(
      meter,
      `${prefix}.sockets.bytes_read`,
      {
        valueType: opentelemetry.ValueType.INT,
      },
    );
    this.bytesWrittenCounter = opentelemetry.getObservableCounter(
      meter,
      `${prefix}.sockets.bytes_written`,
      {
        valueType: opentelemetry.ValueType.INT,
      },
    );
  }

  public start() {
    this.activeSocketsCounter.addCallback(this.observeSocketCount);
    this.bytesReadCounter.addCallback(this.observeBytesRead);
    this.bytesWrittenCounter.addCallback(this.observeBytesWritten);
  }

  public stop() {
    this.activeSocketsCounter.removeCallback(this.observeSocketCount);
    this.bytesReadCounter.removeCallback(this.observeBytesRead);
    this.bytesWrittenCounter.removeCallback(this.observeBytesWritten);
  }

  public addSocket(socket: Socket) {
    if (this.sockets.has(socket)) {
      return;
    }

    this.sockets.add(socket);
    this.socketCounter.add(1);

    socket.on('close', () => {
      this.sockets.delete(socket);

      this.bytesRead += socket.bytesRead;
      this.bytesWritten += socket.bytesWritten;
    });
  }

  private observeSocketCount = (observableResult: opentelemetry.ObservableResult) => {
    observableResult.observe(this.sockets.size);
  };

  private observeBytesRead = (observableResult: opentelemetry.ObservableResult) => {
    let bytesRead = this.bytesRead;

    for (const socket of this.sockets) {
      bytesRead += socket.bytesRead;
    }

    observableResult.observe(bytesRead);
  };

  private observeBytesWritten = (observableResult: opentelemetry.ObservableResult) => {
    let bytesWritten = this.bytesWritten;

    for (const socket of this.sockets) {
      bytesWritten += socket.bytesWritten;
    }

    observableResult.observe(bytesWritten);
  };
}
