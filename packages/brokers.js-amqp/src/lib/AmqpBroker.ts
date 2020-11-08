/*
	Copyright (c) 2020, Will Nelson

	Source from: https://github.com/spec-tacles/spectacles.js/blob/master/packages/brokers/src/Amqp.ts
*/

import { Broker, Options, ResponseOptions } from '@byters/brokers.js';
import * as amqp from 'amqplib';
import { ulid } from 'ulid';
import { isObject } from './utils/utils';
const { isFatalError } = require('amqplib/lib/connection'); // eslint-disable-line @typescript-eslint/no-var-requires

/**
 * @since 0.2.0
 */
export interface AMQpOptions<Send = any, Receive = unknown> extends Options<Send, Receive> {
	/**
	 * @since 0.2.0
	 */
	reconnectTimeout?: number;
	/**
	 * @since 0.2.0
	 */
	consume?: amqp.Options.Consume;
	/**
	 * @since 0.2.0
	 */
	assert?: amqp.Options.AssertQueue;
}

/**
 * @since 0.2.0
 */
export interface AMQpResponseOptions extends ResponseOptions {
	/**
	 * @since 0.2.0
	 */
	ack: () => void;
	/**
	 * @since 0.2.0
	 */
	nack: (allUpTo?: boolean, requeue?: boolean) => void;
	/**
	 * @since 0.2.0
	 */
	reject: (requeue?: boolean) => void;
}

/**
 * @since 0.2.0
 */
export default class AMQpBroker<Send = unknown, Receieve = unknown> extends Broker<Send, Receieve, AMQpResponseOptions> {

	/**
	 * @since 0.2.0
	 */
	public channel?: amqp.Channel;
	/**
	 * @since 0.2.0
	 */
	public callback?: string;
	/**
	 * @since 0.2.0
	 */
	public group: string;
	/**
	 * @since 0.2.0
	 */
	public subgroup?: string;
	/**
	 * @since 0.2.0
	 */
	public options: AMQpOptions<Send, Receieve>;
	/**
	 * @since 0.2.0
	 */
	private _consumers: Map<string, string> = new Map();

	/**
	 * @since 0.2.0
	 */
	public constructor(group?: string, options?: AMQpOptions<Send, Receieve>);
	/**
	 * @since 0.2.0
	 */
	public constructor(group?: string, subgroup?: string, options?: AMQpOptions<Send, Receieve>);
	/**
	 * @since 0.2.0
	 */
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

	/**
	 * @since 0.2.0
	 */
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

	/**
	 * @since 0.2.0
	 */
	public async createQueue(event: string): Promise<string> {
		const queue = `${this.group}:${(this.subgroup ? `${this.subgroup}:` : '') + event}`;
		await this._channel.assertQueue(queue, this.options.assert);
		await this._channel.bindQueue(queue, this.group, event);
		return queue;
	}

	/**
	 * @since 0.2.0
	 */
	public publish(event: string, data: Send, options: amqp.Options.Publish = {}): void {
		this._channel.publish(this.group, event, this.serialize(data), options);
	}

	/**
	 * @since 0.2.0
	 */
	public call(method: string, data: Send, options: amqp.Options.Publish = {}): Promise<Receieve> {
		const correlation = ulid();
		this.publish(method, data, Object.assign(options, {
			replyTo: this.callback,
			correlationId: correlation
		}));

		return this._awaitResponse(correlation, typeof options.expiration === 'string' ? parseInt(options.expiration, 10) : options.expiration);
	}

	/**
	 * @since 0.2.0
	 */
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

	/**
	 * @since 0.2.0
	 */
	public _unsubscribe(events: string[]): Promise<boolean[]> {
		return Promise.all(events.map(async event => {
			const consumer = this._consumers.get(event);

			if (consumer === undefined) return false;

			await this._channel.cancel(consumer);
			this._consumers.delete(event);
			return true;
		}));
	}

	/**
	 * @since 0.2.0
	 * @internal
	 */
	protected get _channel(): amqp.Channel {
		// TODO: Create more specific error
		if (!this.channel) throw new Error('no available amqp channel');
		return this.channel;
	}

}
