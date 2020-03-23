/*
* @adonis-auth
*
* (c) Harminder Virk <virk@adonisjs.com>
*
* For the full copyright and license information, please view the LICENSE
* file that was distributed with this source code.
*/

import 'reflect-metadata'
import { join } from 'path'
import { Ioc } from '@adonisjs/fold'
import { MarkOptional } from 'ts-essentials'
import { Filesystem } from '@poppinss/dev-utils'
import { Hash } from '@adonisjs/hash/build/standalone'
import { ServerResponse, IncomingMessage } from 'http'
import { Logger } from '@adonisjs/logger/build/standalone'
import { Database } from '@adonisjs/lucid/build/src/Database'
import { Profiler } from '@adonisjs/profiler/build/standalone'
import { Emitter } from '@adonisjs/events/build/standalone'
import { Adapter } from '@adonisjs/lucid/build/src/Orm/Adapter'
import { Encryption } from '@adonisjs/encryption/build/standalone'
import { BaseModel } from '@adonisjs/lucid/build/src/Orm/BaseModel'
import { HttpContext } from '@adonisjs/http-server/build/standalone'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { SessionConfigContract } from '@ioc:Adonis/Addons/Session'
import { SessionManager } from '@adonisjs/session/build/src/SessionManager'
import { ModelContract, ModelConstructorContract } from '@ioc:Adonis/Lucid/Model'
import { DatabaseContract, QueryClientContract } from '@ioc:Adonis/Lucid/Database'

import { SessionDriver } from '../src/Drivers/Session'
import { LucidProvider } from '../src/Providers/Lucid'
import { DatabaseProvider } from '../src/Providers/Database'

import {
  LucidProviderUser,
  LucidProviderConfig,
  LucidProviderContract,
  DatabaseProviderConfig,
  DatabaseProviderContract,
} from '@ioc:Adonis/Addons/Auth'

const fs = new Filesystem(join(__dirname, '__app'))
const logger = new Logger({ enabled: false, level: 'debug', name: 'adonis', prettyPrint: true })
const profiler = new Profiler(__dirname, logger, {})
const sessionConfig: SessionConfigContract = {
  driver: 'cookie',
  cookieName: 'adonis-session',
  clearWithBrowser: false,
  age: '2h',
  cookie: {
    path: '/',
  },
}

export const container = new Ioc()
export const secret = 'securelong32characterslongsecret'
export const encryption = new Encryption(secret)
export const hash = new Hash(container, {
  default: 'bcrypt' as const,
  list: {
    bcrypt: {
      driver: 'bcrypt',
      rounds: 10,
    },
  },
})

export const emitter = new Emitter(container)
container.singleton('Adonis/Core/Emitter', () => emitter)
container.singleton('Adonis/Core/Encryption', () => encryption)
container.singleton('Adonis/Core/Config', () => {
  return {
    get () {
      return secret
    },
  }
})

/**
 * Create the users tables
 */
async function createUsersTable (client: QueryClientContract) {
  await client.schema.createTable('users', (table) => {
    table.increments('id').notNullable().primary()
    table.string('username').notNullable().unique()
    table.string('email').notNullable().unique()
    table.string('password')
    table.boolean('is_active').notNullable().defaultTo(1)
    table.string('country').notNullable().defaultTo('IN')
  })
}

/**
 * Create the token tables
 */
async function createTokensTable (client: QueryClientContract) {
  await client.schema.createTable('tokens', (table) => {
    table.increments('id').notNullable().primary()
    table.integer('user_id').notNullable()
    table.string('token_value').notNullable()
    table.string('token_type').notNullable()
    table.date('expires_on').nullable()
    table.boolean('is_revoked').notNullable().defaultTo(0)
    table.unique(['token_type', 'token_value'])
  })
}

/**
 * Returns default config for the lucid provider
 */
export function getLucidProviderConfig <User extends LucidProviderUser> (
  config: MarkOptional<LucidProviderConfig<User>, 'driver' | 'uids' | 'identifierKey' | 'verifyPassword'>,
) {
  const defaults: LucidProviderConfig<User> = {
    driver: 'lucid' as const,
    uids: ['username', 'email'],
    model: config.model,
    identifierKey: 'id',
    async verifyPassword (user, password) {
      return hash.verify(user.password, password)
    },
  }

  return defaults
}

/**
 * Returns default config for the database provider
 */
export function getDatabaseProviderConfig () {
  const defaults: DatabaseProviderConfig = {
    driver: 'database' as const,
    uids: ['username', 'email'],
    identifierKey: 'id',
    usersTable: 'users',
    tokensTable: 'tokens',
    async verifyPassword () {
      return true
    },
  }

  return defaults
}

/**
 * Returns instance of database
 */
export async function getDb () {
  await fs.ensureRoot()

  const db = new Database({
    connection: 'primary',
    connections: {
      primary: {
        client: 'sqlite3',
        connection: {
          filename: join(fs.basePath, 'primary.sqlite3'),
        },
        debug: false,
      },
      secondary: {
        client: 'sqlite3',
        connection: {
          filename: join(fs.basePath, 'secondary.sqlite3'),
        },
        debug: false,
      },
    },
  }, logger, profiler) as unknown as DatabaseContract

  container.singleton('Adonis/Lucid/Database', () => db)
  return db
}

/**
 * Performs an initial setup
 */
export async function setup (db: DatabaseContract) {
  await createUsersTable(db.connection())
  await createTokensTable(db.connection())

  await createUsersTable(db.connection('secondary'))
  await createTokensTable(db.connection('secondary'))

  HttpContext.getter('session', function session () {
    const sessionManager = new SessionManager(container, sessionConfig)
    return sessionManager.create(this)
  }, true)
}

/**
 * Performs cleanup
 */
export async function cleanup (db: DatabaseContract) {
  await db.connection().schema.dropTableIfExists('users')
  await db.connection().schema.dropTableIfExists('tokens')

  await db.connection('secondary').schema.dropTableIfExists('users')
  await db.connection('secondary').schema.dropTableIfExists('tokens')

  await db.manager.closeAll()
  await fs.cleanup()
}

/**
 * Reset database tables
 */
export async function reset (db: DatabaseContract) {
  await db.connection().truncate('users')
  await db.connection().truncate('tokens')

  await db.connection('secondary').truncate('users')
  await db.connection('secondary').truncate('tokens')
}

/**
 * Returns Base model that other models can extend
 */
export function getModel (db: DatabaseContract) {
  BaseModel.$adapter = new Adapter(db)
  BaseModel.$container = container
  return BaseModel as unknown as ModelConstructorContract<ModelContract>
}

/**
 * Returns an instance of the lucid provider
 */
export function getLucidProvider<User extends LucidProviderUser> (
  config: MarkOptional<LucidProviderConfig<User>, 'driver' | 'uids' | 'identifierKey' | 'verifyPassword'>,
) {
  const defaults = getLucidProviderConfig(config)
  const normalizedConfig = Object.assign(defaults, config) as LucidProviderConfig<User>
  return new LucidProvider(normalizedConfig) as unknown as LucidProviderContract<User>
}

/**
 * Returns an instance of the database provider
 */
export function getDatabaseProvider (config: Partial<DatabaseProviderConfig>) {
  const defaults = getDatabaseProviderConfig()
  const normalizedConfig = Object.assign(defaults, config) as DatabaseProviderConfig
  const db = container.use('Adonis/Lucid/Database')
  return new DatabaseProvider(normalizedConfig, db) as unknown as DatabaseProviderContract<any>
}

/**
 * Returns an instance of ctx
 */
export function getCtx (req?: IncomingMessage, res?: ServerResponse) {
  const httpRow = profiler.create('http:request')
  return HttpContext
    .create(
      '/',
      {},
      logger,
      httpRow,
      encryption,
      req,
      res,
      { secret: secret } as any,
    ) as unknown as HttpContextContract
}

/**
 * Returns an instance of the session driver.
 */
export function getSessionDriver (
  provider: DatabaseProviderContract<any> | LucidProviderContract<any>,
  providerConfig: DatabaseProviderConfig | LucidProviderConfig<any>,
  ctx: HttpContextContract,
) {
  const config = {
    driver: 'session' as const,
    provider: providerConfig,
  }

  return new SessionDriver('session', secret, config, emitter, provider, ctx)
}
