import 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    pythonServer: {
      readonly pid: number | undefined;
      readonly running: boolean;
      restart: () => Promise<void>;
    };
  }
}
