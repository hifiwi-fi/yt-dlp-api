import 'fastify'
import type { DotEnvSchemaType } from '../config/env-schema.js'
import type { PackageJson } from 'type-fest'

declare module 'fastify' {
  interface FastifyInstance {
    config: DotEnvSchemaType,
    pkg: PackageJson
  }
}
