import { decode, encode } from '@spectacles/util';
import { EventEmitter } from 'events';
import { Brokers } from '../Brokers';
import { Awaited } from '../utils/Types';

export type Serialize<Send> = (data: Send) => Buffer;
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

	public readonly kSerialize: Serialize<Send>;
	public readonly kDeserialize: Deserialize<Receive>;

	protected brokerClient!: Brokers;
	private readonly _responses: EventEmitter = new EventEmitter();

	public constructor(options?: Options<Send, Receive>) {
		this.kSerialize = options?.serialize ?? encode;
		this.kDeserialize = options?.deserialize ?? decode;
		this._responses.setMaxListeners(0);
	}

	public abstract start(...args: any[]): Awaited<unknown>;

	public abstract publish(event: string, data: Send, options?: SendOptions): Awaited<unknown>;

	public abstract call(method: string, data: Send, ...args: any[]): Awaited<unknown>;

	public abstract _subscribe(events: string[]): Awaited<unknown>;
	public abstract _unsubscribe(events: string[]): Awaited<unknown>;

	protected _handleMessage(event: string, message: Buffer | Receive, options: ROpts): void {
		if (Buffer.isBuffer(message)) message = this.kDeserialize(message);
		this.brokerClient.emit(event, message, options);
	}

	protected _handleReply(event: string, message: Buffer | Receive): void {
		if (Buffer.isBuffer(message)) message = this.kDeserialize(message);
		this._responses.emit(event, message);
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
