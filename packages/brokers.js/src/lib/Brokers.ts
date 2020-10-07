import { EventEmitter } from 'events';
import { Broker, SendOptions } from './structures/Broker';
import { Awaited } from './utils/Types';

export class Brokers extends EventEmitter {

	/* eslint-disable @typescript-eslint/naming-convention */
	public readonly broker: Broker<unknown, unknown>;
	public readonly subscribedEvents = new Set<string>();
	/* eslint-enable @typescript-eslint/naming-convention */

	public constructor(broker: Broker<unknown, unknown>) {
		super();

		this.broker = broker;
	}

	public start(...args: any[]): Awaited<unknown> {
		return this.broker.start(...args);
	}

	public publish(event: string, data: unknown, options?: SendOptions): Awaited<unknown> {
		return this.broker.publish(event, data, options);
	}

	public call(method: string, data: unknown, ...args: any[]): Awaited<unknown> {
		return this.broker.call(method, data, ...args);
	}

	public subscribe(events: string | string[]): Awaited<unknown> {
		if (!Array.isArray(events)) events = [events];
		for (const event of events) this.subscribedEvents.add(event);
		return this.broker._subscribe(events);
	}

	public unsubscribe(events: string | string[]): Awaited<unknown> {
		if (!Array.isArray(events)) events = [events];
		for (const event of events) this.subscribedEvents.delete(event);
		return this.broker._unsubscribe(events);
	}

}
