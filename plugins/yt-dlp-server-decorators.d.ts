import 'fastify'

type YtDlpValue = null | boolean | number | string | YtDlpValue[] | { [key: string]: YtDlpValue }

interface YtDlpIpcResponse {
  statusCode: number;
  body: YtDlpValue;
}

declare module 'fastify' {
  interface FastifyInstance {
    pythonServer: {
      readonly pid: number | undefined;
      readonly running: boolean;
      info: (params: { url: string; format: string }) => Promise<YtDlpIpcResponse>;
      ytdlp: () => Promise<YtDlpIpcResponse>;
      restart: () => Promise<void>;
    };
  }
}
