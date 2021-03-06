/*
	Copyright (c) 2020, Will Nelson

	Source from: https://github.com/spec-tacles/spectacles.js/blob/master/packages/brokers/src/Redis.ts
*/

import { Broker, Options, ResponseOptions } from '@byters/brokers.js';
import { encode } from '@spectacles/util';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import * as Redis from 'ioredis';
import { partition, zipObject } from 'lodash';
import { resolve } from 'path';
import { isObject } from './utils/utils';

export interface PublishOptions {
	timeout?: number;
}

export interface ClientOptions {
	blockInterval?: number;
	maxChunk?: number;
	name?: string;
}

export interface RedisResponseOptions extends ResponseOptions {
	ack: () => void;
}

Redis.Command.setArgumentTransformer('xadd', args => {
	if (args.length === 3) {
		const toAdd = args.pop();
		// TODO: Create more precise error for failed publishment due to wrong type
		if (!isObject(toAdd)) throw new Error('unable to add publish non-object');

		let entries: Iterable<[unknown, unknown]> = [];
		if (toAdd instanceof Map) entries = toAdd.entries();
		else entries = Object.entries(toAdd);

		const arr = [];
		for (const [k, v] of entries) arr.push(k, v);
		return args.concat(arr);
	}

	return args;
});

export class RedisBroker<Send = unknown, Receive = unknown> extends Broker<Send, Receive, RedisResponseOptions> {

	public name: string;
	public blockInterval: number;
	public maxChunk: number;

	protected _listening = false;
	protected _streamReadClient: Redis.Redis;
	protected _rpcReadClient: Redis.Redis;

	public constructor(public group: string, public redis: Redis.Redis, options: ClientOptions = {}, brokerOptions?: Options<Send, Receive>) {
		super(brokerOptions);

		this.name = options.name || randomBytes(20).toString('hex');
		this.blockInterval = options.blockInterval || 5000;
		this.maxChunk = options.maxChunk || 10;

		redis.defineCommand('xcleangroup', {
			numberOfKeys: 1,
			lua: readFileSync(resolve(__dirname, '.', 'scripts', 'xcleangroup.lua')).toString()
		});

		this._rpcReadClient = redis.duplicate();
		this._rpcReadClient.on('messageBuffer', (channel: Buffer, message: Buffer) => {
			const [, id] = channel.toString().split(':');
			if (id) this._handleReply(id, message);
		});

		this._streamReadClient = redis.duplicate();
	}

	public start(...args: any[]) {
		void args;
	}

	public publish(event: string, data: Send) {
		return this.redis.xadd(event, '*', data) as Promise<string>;
	}

	public async call(method: string, data: Send, options: PublishOptions = {}): Promise<Receive> {
		const id = await this.publish(method, data) as string;
		const rpcChannel = `${method}:${id}`;
		await this._rpcReadClient.subscribe(rpcChannel);

		try {
			return await this._awaitResponse(id, options.timeout);
		} finally {
			await this._rpcReadClient.unsubscribe(rpcChannel);
		}
	}

	public async _subscribe(events: string[]): Promise<void> {
		await Promise.all(events.map(async event => {
			try {
				await this.redis.xgroup('CREATE', event, this.group, 0, 'MKSTREAM');
			} catch (e) {
				if (!(e instanceof (Redis as any).ReplyError)) throw e;
			}
		}));

		await this._listen();
	}

	public async _unsubscribe(events: string[]): Promise<void> {
		const cmds: string[][] = Array(events.length * 2);
		for (let i = 0; i < cmds.length; i += 2) {
			const event = events[i / 2];
			cmds[i] = ['xgroup', 'delconsumer', event, this.group, this.name];
			cmds[i + 1] = ['xcleangroup', event, this.group];
		}

		await this.redis.pipeline(cmds).exec();
	}

	private async _listen(): Promise<void> {
		if (this._listening) return;
		this._listening = true;

		let events: Array<string> = [];
		while (true) {
			events = [...this.brokerClient.subscribedEvents];

			try {
				const data = await this._streamReadClient.xreadgroup(
					'GROUP', this.group, this.name,
					'COUNT', String(this.maxChunk),
					'BLOCK', String(this.blockInterval),
					'STREAMS', ...events,
					...Array(events.length).fill('>')
				);

				if (!data) continue;

				for (const [event, info] of data) {
					for (const [id, packet] of info) {
						let i = 0;
						const obj = zipObject(...partition(packet, () => i++ % 2 === 0)) as unknown as Receive;

						this._handleMessage(event, obj, {
							reply: data => this.redis.publish(`${event}:${id}`, encode(data) as any),
							ack: () => this.redis.xack(event, this.group, id)
						});
					}
				}
			} catch (e) {
				this.brokerClient.emit('error', e);
				break;
			}
		}

		this._listening = false;
	}

}

declare module 'ioredis' {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface Redis {
	  xcleangroup(key: string, group: string): Promise<boolean>;
	  // TODO: Figure out a way to not break internals with this. /shrug
	  // eslint-disable-next-line @typescript-eslint/no-unnecessary-qualifier
	  xadd(key: Redis.KeyType, id: string, ...args: any[]): Promise<unknown>;
	}
}
