/*
 * @adonisjs/auth
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import test from 'japa'
import 'reflect-metadata'
import { UserProviderContract } from '@ioc:Adonis/Addons/Auth'
import { ApplicationContract } from '@ioc:Adonis/Core/Application'

import { Auth } from '../src/Auth'
import { AuthManager } from '../src/AuthManager'
import { LucidProvider } from '../src/UserProviders/Lucid'
import { DatabaseProvider } from '../src/UserProviders/Database'
import { OATGuard } from '../src/Guards/Oat'
import { SessionGuard } from '../src/Guards/Session'
import { BasicAuthGuard } from '../src/Guards/BasicAuth'

import {
	setup,
	reset,
	cleanup,
	getUserModel,
	setupApplication,
	getLucidProviderConfig,
	getDatabaseProviderConfig,
} from '../test-helpers'

let app: ApplicationContract

test.group('Auth Manager', (group) => {
	group.before(async () => {
		app = await setupApplication()
		await setup(app)
	})

	group.after(async () => {
		await cleanup(app)
	})

	group.afterEach(async () => {
		await reset(app)
	})

	test('make an instance of the session guard with lucid provider', (assert) => {
		const User = getUserModel(app.container.use('Adonis/Lucid/Orm').BaseModel)

		const manager = new AuthManager(app, {
			guard: 'session',
			list: {
				api: {
					driver: 'oat',
					tokenProvider: {
						driver: 'database',
						table: 'api_tokens',
					},
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				basic: {
					driver: 'basic',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				session: {
					driver: 'session',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				sessionDb: {
					driver: 'session',
					provider: getDatabaseProviderConfig(),
				},
			},
		})

		const ctx = app.container.use('Adonis/Core/HttpContext').create('/', {})

		const mapping = manager.makeMapping(ctx, 'session')
		assert.instanceOf(mapping, SessionGuard)
		assert.instanceOf(mapping.provider, LucidProvider)
	})

	test('make an instance of the session guard with database provider', (assert) => {
		const User = getUserModel(app.container.use('Adonis/Lucid/Orm').BaseModel)

		const manager = new AuthManager(app, {
			guard: 'session',
			list: {
				api: {
					driver: 'oat',
					tokenProvider: {
						driver: 'database',
						table: 'api_tokens',
					},
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				basic: {
					driver: 'basic',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				session: {
					driver: 'session',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				sessionDb: {
					driver: 'session',
					provider: getDatabaseProviderConfig(),
				},
			},
		})

		const ctx = app.container.use('Adonis/Core/HttpContext').create('/', {})

		const mapping = manager.makeMapping(ctx, 'sessionDb')
		assert.instanceOf(mapping, SessionGuard)
		assert.instanceOf(mapping.provider, DatabaseProvider)
	})

	test('make an instance of auth class for a given http request', (assert) => {
		const User = getUserModel(app.container.use('Adonis/Lucid/Orm').BaseModel)

		const manager = new AuthManager(app, {
			guard: 'session',
			list: {
				api: {
					driver: 'oat',
					tokenProvider: {
						driver: 'database',
						table: 'api_tokens',
					},
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				basic: {
					driver: 'basic',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				session: {
					driver: 'session',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				sessionDb: {
					driver: 'session',
					provider: getDatabaseProviderConfig(),
				},
			},
		})

		const ctx = app.container.use('Adonis/Core/HttpContext').create('/', {})

		const auth = manager.getAuthForRequest(ctx)
		assert.instanceOf(auth, Auth)
	})

	test('extend by adding custom provider', (assert) => {
		class MongoDBProvider implements UserProviderContract<any> {
			constructor(config: any) {
				assert.deepEqual(config, { driver: 'mongodb' })
			}

			public getUserFor(): any {}
			public async findById(): Promise<any> {}
			public async findByRememberMeToken(): Promise<any> {}
			public async findByUid(): Promise<any> {}
			public async updateRememberMeToken() {}
		}

		const manager = new AuthManager(app, {
			guard: 'session',
			list: {
				session: {},
				admin: {
					driver: 'session',
					provider: {
						driver: 'mongodb',
					},
				},
			},
		} as any)

		manager.extend('provider', 'mongodb', (_, config) => {
			return new MongoDBProvider(config)
		})

		const ctx = app.container.use('Adonis/Core/HttpContext').create('/', {})
		assert.instanceOf(manager.makeMapping(ctx, 'admin' as any).provider, MongoDBProvider)
	})

	test('extend by adding custom guard', (assert) => {
		class MongoDBProvider implements UserProviderContract<any> {
			constructor(config: any) {
				assert.deepEqual(config, { driver: 'mongodb' })
			}

			public getUserFor(): any {}
			public async findById(): Promise<any> {}
			public async findByRememberMeToken(): Promise<any> {}
			public async findByUid(): Promise<any> {}
			public async updateRememberMeToken() {}
		}

		class CustomGuard {
			constructor(mapping: string, config: any, public provider: any) {
				assert.equal(mapping, 'admin')
				assert.deepEqual(config, { driver: 'google', provider: { driver: 'mongodb' } })
			}
		}

		const manager = new AuthManager(app, {
			guard: 'session',
			list: {
				session: {},
				admin: {
					driver: 'google',
					provider: {
						driver: 'mongodb',
					},
				},
			},
		} as any)

		manager.extend('provider', 'mongodb', (_, config) => {
			return new MongoDBProvider(config)
		})

		manager.extend('guard', 'google', (_, mapping, config, provider) => {
			return new CustomGuard(mapping, config, provider) as any
		})

		const ctx = app.container.use('Adonis/Core/HttpContext').create('/', {})
		assert.instanceOf(manager.makeMapping(ctx, 'admin' as any), CustomGuard)
		assert.instanceOf(manager.makeMapping(ctx, 'admin' as any).provider, MongoDBProvider)
	})

	test('make an instance of the oat guard with lucid provider', (assert) => {
		const User = getUserModel(app.container.use('Adonis/Lucid/Orm').BaseModel)

		const manager = new AuthManager(app, {
			guard: 'api',
			list: {
				api: {
					driver: 'oat',
					tokenProvider: {
						driver: 'database',
						table: 'api_tokens',
					},
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				basic: {
					driver: 'basic',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				session: {
					driver: 'session',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				sessionDb: {
					driver: 'session',
					provider: getDatabaseProviderConfig(),
				},
			},
		})

		const ctx = app.container.use('Adonis/Core/HttpContext').create('/', {})

		const mapping = manager.makeMapping(ctx, 'api')
		assert.instanceOf(mapping, OATGuard)
		assert.instanceOf(mapping.provider, LucidProvider)
	})

	test('make an instance of the basic auth guard with lucid provider', (assert) => {
		const User = getUserModel(app.container.use('Adonis/Lucid/Orm').BaseModel)

		const manager = new AuthManager(app, {
			guard: 'api',
			list: {
				api: {
					driver: 'oat',
					tokenProvider: {
						driver: 'database',
						table: 'api_tokens',
					},
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				basic: {
					driver: 'basic',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				session: {
					driver: 'session',
					provider: getLucidProviderConfig({ model: async () => User }),
				},
				sessionDb: {
					driver: 'session',
					provider: getDatabaseProviderConfig(),
				},
			},
		})

		const ctx = app.container.use('Adonis/Core/HttpContext').create('/', {})

		const mapping = manager.makeMapping(ctx, 'basic')
		assert.instanceOf(mapping, BasicAuthGuard)
		assert.instanceOf(mapping.provider, LucidProvider)
	})
})
