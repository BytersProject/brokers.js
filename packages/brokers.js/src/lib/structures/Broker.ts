import { EventEmitter } from 'events';
import { Brokers } from '../Brokers';
import { decode, encode } from '../encoding/BufferEnc';
import { Awaited } from '../utils/Types';

// TODO: Allow for custom output
export type Serialize<Send> = (data: Send) => Buffer;
// TODO: Allow for custom input
export type Deserialize<Receive> = (data: Buffer) => Receive;

export interface Options<Send = any, Receive = unknown> {
	serialize?: Serialize<Send>;
	deserialize?: Deserialize<Receive>;
}

export interface SendOptions {
	expiration?: number;
}

export interface ResponseOptions<T = unknown> {
	reply: (data: T) => void;
}

export abstract class Broker<Send, Receive, ROpts extends ResponseOptions = ResponseOptions> {

	public readonly serialize: Serialize<Send>;
	public readonly deserialize: Deserialize<Receive>;

	protected brokerClient!: Brokers;
	private readonly _responses: EventEmitter = new EventEmitter();

	public constructor(options?: Options<Send, Receive>) {
		this.serialize = options?.serialize ?? encode;
		this.deserialize = options?.deserialize ?? decode;
		this._responses.setMaxListeners(0);
	}

	public _init(client: Brokers) {
		this.brokerClient = client;
	}

	public abstract start(...args: any[]): Awaited<any>;

	public abstract publish(event: string, data: Send, options?: SendOptions): Awaited<any>;

	public abstract call(method: string, data: Send, ...args: any[]): Awaited<any>;

	public abstract _subscribe(events: string[]): Awaited<any>;
	public abstract _unsubscribe(events: string[]): Awaited<any>;

	protected _handleMessage(event: string, message: Buffer | Receive, options: ROpts): void {
		this.brokerClient.emit(event, this._deserializeMessage(message), options);
	}

	protected _handleReply(event: string, message: Buffer | Receive): void {
		this._responses.emit(event, this._deserializeMessage(message));
	}

	protected _deserializeMessage(message: Buffer | Receive): Receive {
		if (Buffer.isBuffer(message)) message = this.deserialize(message);
		return message;
	}

	protected _awaitResponse(id: string, expiration: number = Broker.DEFAULT_EXPIRATION) {
		return new Promise<Receive>((resolve, reject) => {
			// eslint-disable-next-line no-undef
			let timeout: NodeJS.Timeout | null = null;

			const listener = (response: Receive) => {
				clearTimeout(timeout!);
				resolve(response);
			};

			timeout = setTimeout(() => {
				this._responses.removeListener(id, listener);
				reject(new Error('callback exceeded time limit'));
			}, expiration);

			this._responses.once(id, listener);
		});
	}

	public static DEFAULT_EXPIRATION = 5e3;

}
