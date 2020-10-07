import { decode, encode } from '@spectacles/util';
import { EventEmitter } from 'events';
import { Brokers } from '../Brokers';

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

// TODO: Yes
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/naming-convention
export abstract class Broker<Send, Receive, _ROpts extends ResponseOptions = ResponseOptions> {

	public readonly kSerialize: Serialize<Send>;
	public readonly kDeserialize: Deserialize<Receive>;

	protected brokerClient!: Brokers;
	/* eslint-disable @typescript-eslint/naming-convention */
	protected readonly _subscribedEvents = new Set<string>();
	private readonly _responses: EventEmitter = new EventEmitter();
	/* eslint-enable @typescript-eslint/naming-convention */

	public constructor(options?: Options<Send, Receive>) {
		this.kSerialize = options?.serialize ?? encode;
		this.kDeserialize = options?.deserialize ?? decode;
		this._responses.setMaxListeners(0);
	}

	public abstract start(...args: any[]): any;

	public abstract publish(event: string, data: Send, options?: SendOptions): unknown;

	public abstract call(method: string, data: Send, ...args: any[]): unknown;

	/* eslint-disable @typescript-eslint/naming-convention */
	protected abstract _subscribe(events: string[]): unknown;
	protected abstract _unsubscribe(events: string[]): unknown;
	/* eslint-enable @typescript-eslint/naming-convention */

	// eslint-disable-next-line @typescript-eslint/naming-convention
	public static DEFAULT_EXPIRATION = 5e3;

}
