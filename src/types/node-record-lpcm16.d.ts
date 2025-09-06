declare module 'node-record-lpcm16' {
  interface RecordOptions {
    sampleRate?: number;
    channels?: number;
    audioType?: string;
    encoding?: string;
    endian?: string;
    bitDepth?: number;
  }

  interface Recording {
    stream(): NodeJS.ReadableStream;
    stop(): void;
  }

  export function record(options?: RecordOptions): Recording;
}