// Minimal type definitions for socket.io-client
declare namespace io {
  function connect(url: string, options?: any): {
    on(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    disconnect(): void;
  };
}

