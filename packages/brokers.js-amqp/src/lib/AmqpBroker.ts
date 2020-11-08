/*
	Copyright (c) 2020, Will Nelson

	Source from: https://github.com/spec-tacles/spectacles.js/blob/master/packages/brokers/src/Amqp.ts
*/

import { Broker, Options, ResponseOptions } from '@byters/brokers.js';
import * as amqp from 'amqplib';
import { ulid } from 'ulid';
import { isObject } from './utils/utils';
const { isFatalError } = require('amqplib/lib/connection'); // eslint-disable-line @typescript-eslint/no-var-requires

export interface AMQpOptions<Send = any, Receive = unknown> extends Options<Send, Receive> {
	reconnectTimeout?: number;
	consume?: amqp.Options.Consume;
	assert?: amqp.Options.AssertQueue;
}

export interface AMQpResponseOptions extends ResponseOptions {
	ack: () => void;
	nack: (allUpTo?: boolean, requeue?: boolean) => void;
	reject: (requeue?: boolean) => void;
}

export class AMQpBroker<Send = unknown, Receieve = unknown> extends Broker<Send, Receieve, AMQpResponseOptions> {

	public channel?: amqp.Channel;
	public callback?: string;
	public group: string;
	public subgroup?: string;
	public options: AMQpOptions<Send, Receieve>;
	private _consumers: Map<string, string> = new Map();

	public constructor(group?: string, options?: AMQpOptions<Send, Receieve>);
	public constructor(group?: string, subgroup?: string, options?: AMQpOptions<Send, Receieve>);
	public constructor(group = 'default', subgroup?: AMQpOptions<Send, Receieve> | string, options?: AMQpOptions<Send, Receieve>) {
		if (isObject(subgroup)) {
			super(subgroup);
			this.options = subgroup;
		} else {
			super(options);
			this.subgroup = subgroup;
			this.options = options ?? {};
		}

		this.group = group;
	}

	public async start(urlOrConn: string | amqp.Connection, options?: any): Promise<amqp.Connection> {
		let connection: amqp.Connection | undefined = undefined;
		if (typeof urlOrConn !== 'string') connection = urlOrConn;

		while (!connection) {
			try {
				connection = await amqp.connect(`amqp://${urlOrConn as string}`, options);
			} catch (e) {
				this.brokerClient.emit('close', e);
				await new Promise(r => setTimeout(r, this.options.reconnectTimeout ?? 60000 /* 60s */));
				continue;
			}

			connection.on('close', err => {
				if (!isFatalError(err)) {
					this.brokerClient.emit('close', err);
					setTimeout(() => this.start(urlOrConn, options), this.options.reconnectTimeout ?? 60000 /* 60s */);
				}
			});

			connection.on('error', err => {
				this.brokerClient.emit('error', err);
			});
		}

		this.channel = await connection.createChannel();

		this.callback = (await this.channel.assertQueue('', { exclusive: true })).queue;
		await this.channel.consume(this.callback, msg => {
			if (msg) this._handleReply(msg.properties.correlationId, msg.content);
		}, { noAck: true });

		await this.channel.assertExchange(this.group, 'direct');
		return connection;
	}

	public async createQueue(event: string): Promise<string> {
		const queue = `${this.group}:${(this.subgroup ? `${this.subgroup}:` : '') + event}`;
		await this._channel.assertQueue(queue, this.options.assert);
		await this._channel.bindQueue(queue, this.group, event);
		return queue;
	}

	public publish(event: string, data: Send, options: amqp.Options.Publish = {}): void {
		this._channel.publish(this.group, event, this.serialize(data), options);
	}

	public call(method: string, data: Send, options: amqp.Options.Publish = {}): Promise<Receieve> {
		const correlation = ulid();
		this.publish(method, data, Object.assign(options, {
			replyTo: this.callback,
			correlationId: correlation
		}));

		return this._awaitResponse(correlation, typeof options.expiration === 'string' ? parseInt(options.expiration, 10) : options.expiration);
	}

	public _subscribe(events: string[]): Promise<amqp.Replies.Consume[]> {
		return Promise.all(events.map(async event => {
			const queue = await this.createQueue(event);
			const consumer = await this._channel.consume(queue, msg => {
				if (msg) {
					try {
						this._handleMessage(event, msg.content, {
							reply: data => this._channel.sendToQueue(msg.properties.replyTo, this.serialize(data as Send), { correlationId: msg.properties.correlationId }),
							ack: () => this._channel.ack(msg),
							nack: (allUpTo, requeue) => this._channel.nack(msg, allUpTo, requeue),
							reject: requeue => this._channel.reject(msg, requeue)
						});
					} catch (e) {
						this._channel.reject(msg, false);
						this.brokerClient.emit('error', e);
					}
				}
			}, this.options.consume);

			this._consumers.set(event, consumer.consumerTag);
			return consumer;
		}));
	}

	public _unsubscribe(events: string[]): Promise<boolean[]> {
		return Promise.all(events.map(async event => {
			const consumer = this._consumers.get(event);

			if (consumer === undefined) return false;

			await this._channel.cancel(consumer);
			this._consumers.delete(event);
			return true;
		}));
	}

	protected get _channel(): amqp.Channel {
		// TODO: Create more specific error
		if (!this.channel) throw new Error('no available amqp channel');
		return this.channel;
	}

}
