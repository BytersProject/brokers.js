import { Broker, Options, ResponseOptions } from '@byters/brokers.js';
import { mergeDefault } from '@sapphire/utilities';
import { NatsError, Client, connect, RequestOptions, REQ_TIMEOUT, ClientOpts } from 'nats';

export interface _NATSSubscription {
	subject: string;
	// eslint-disable-next-line @typescript-eslint/ban-types
	callback: Function;
	received: number;
}

export interface NATSBrokerEvents {
	// #region NATS Errors
	error: [NatsError];
	connect: [Client];
	disconnect: [];
	reconnecting: [];
	reconnect: [Client];
	close: [];
	unsubscribe: [string | number, string];
	permission_error: [NatsError];
	// #endregion NATS Errors
	// #region Broker Errors
	callError: [string, NatsError];
	// #endregion Broker Errors
}

export class NATSBroker<Send = unknown, Receieve = unknown> extends Broker<Send, Receieve, ResponseOptions> {

	public connection!: Client;
	public callback?: string;
	public options: ClientOpts;
	private _subscriptions: Map<string, number> = new Map();

	public constructor(options: Options<Send, Receieve> & ClientOpts) {
		super(options);

		// @ts-expect-error Incompatible types. ts(2322)
		this.options = mergeDefault(options, {
			preserveBuffers: true
		});
	}

	// TODO: Support multiple options
	public start(): Client {
		this.connection = connect(this.options);
		return this.connection;
	}

	public publish(event: string, data: Send): void {
		this.connection.publish(event, this.serialize(data));
	}

	public call(event: string, data: Send, options?: RequestOptions) {
		const timeout = options?.timeout ?? 60000; /* 60s */
		return new Promise<Receieve>((resolve, reject) => {
			this.connection.requestOne(event, this.serialize(data), options ?? {}, timeout, (msg: unknown) => {
				if (msg instanceof NatsError && msg.code === REQ_TIMEOUT) {
					this.brokerClient.emit('callError', event, msg);
					reject(msg.message);
				} else {
					resolve(this.deserialize(msg as Buffer));
				}
			});
		});
	}

	public _subscribe(events: string[]) {
		return Promise.all(events.map(event => {
			// https://github.com/nats-io/nats.js/blob/9104791183dcafea7cf3b3180e5c9f61b73b1777/lib/nats.js#L1467
			// https://docs.nats.io/nats-protocol/nats-protocol#msg
			const sub = this.connection.subscribe(event, (msg: Buffer, reply: string) => {
				this._handleMessage(event, msg, {
					// TODO: Set default serialize method as an extension of `toString`
					reply: data => this.connection.publish(reply, this.serialize(data as Send))
				});
			});

			this._subscriptions.set(event, sub);
			return sub;
		}));
	}

	public _unsubscribe(events: string[]): Promise<boolean[]> {
		return Promise.all(events.map(event => {
			const subscription = this._subscriptions.get(event);

			if (subscription === undefined) return false;

			this.connection.unsubscribe(subscription);
			this._subscriptions.delete(event);
			return true;
		}));
	}

}

declare module '@byters/brokers.js' {
	export interface Brokers {
		on<K extends keyof NATSBrokerEvents>(event: K, listener: (...args: NATSBrokerEvents[K]) => void): this;
		on<S extends string | symbol>(
			event: Exclude<S, keyof NATSBrokerEvents>,
			listener: (...args: any[]) => void,
		): this;

		once<K extends keyof NATSBrokerEvents>(event: K, listener: (...args: NATSBrokerEvents[K]) => void): this;
		once<S extends string | symbol>(
			event: Exclude<S, keyof NATSBrokerEvents>,
			listener: (...args: any[]) => void,
		): this;

		emit<K extends keyof NATSBrokerEvents>(event: K, ...args: NATSBrokerEvents[K]): boolean;
		emit<S extends string | symbol>(event: Exclude<S, keyof NATSBrokerEvents>, ...args: any[]): boolean;

		off<K extends keyof NATSBrokerEvents>(event: K, listener: (...args: NATSBrokerEvents[K]) => void): this;
		off<S extends string | symbol>(
			event: Exclude<S, keyof NATSBrokerEvents>,
			listener: (...args: any[]) => void,
		): this;

		removeAllListeners<K extends keyof NATSBrokerEvents>(event?: K): this;
		removeAllListeners<S extends string | symbol>(event?: Exclude<S, keyof NATSBrokerEvents>): this;
	}
}
