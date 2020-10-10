import { EventEmitter } from 'events';
import { Broker, SendOptions } from './structures/Broker';
import { Awaited } from './utils/Types';

export class Brokers<B extends Broker<unknown, unknown> = Broker<unknown, unknown>> extends EventEmitter {

	/* eslint-disable @typescript-eslint/naming-convention */
	public readonly broker: B;
	public readonly subscribedEvents = new Set<string>();
	/* eslint-enable @typescript-eslint/naming-convention */

	public constructor(broker: B) {
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
