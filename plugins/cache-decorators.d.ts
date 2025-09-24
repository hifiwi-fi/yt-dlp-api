import 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    cache: {
      get(key: string): Promise<any>;
      set(key: string, value: any, ttl: number): Promise<void>;
    };
  }
}
