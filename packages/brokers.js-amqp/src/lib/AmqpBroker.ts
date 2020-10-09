/* eslint-disable @typescript-eslint/no-unused-vars */
import { Broker, Options, ResponseOptions, SendOptions } from '@byters/brokers.js';
import * as amqp from 'amqplib';

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

	public start(...args: any[]): unknown {
		throw new Error('Method not implemented.');
	}

	public publish(event: string, data: Send, options?: SendOptions): unknown {
		throw new Error('Method not implemented.');
	}

	public call(method: string, data: Send, ...args: any[]): unknown {
		throw new Error('Method not implemented.');
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	public _subscribe(events: string[]): unknown {
		throw new Error('Method not implemented.');
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	public _unsubscribe(events: string[]): unknown {
		throw new Error('Method not implemented.');
	}

}
