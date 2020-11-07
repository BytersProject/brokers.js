import { EventEmitter } from 'events';
import { Broker, SendOptions } from './structures/Broker';

export class Brokers<B extends Broker<unknown, unknown> = Broker<unknown, unknown>> extends EventEmitter {

	public readonly broker: B;
	public readonly subscribedEvents = new Set<string>();

	public constructor(broker: B) {
		super();

		this.broker = broker;
	}

	public start<T = ReturnType<B['start']>>(...args: any[]): T {
		return this.broker.start(...args);
	}

	public publish<T = ReturnType<B['publish']>>(event: string, data: unknown, options?: SendOptions): T {
		return this.broker.publish(event, data, options);
	}

	public call<T = ReturnType<B['call']>>(method: string, data: unknown, ...args: any[]): T {
		return this.broker.call(method, data, ...args);
	}

	public subscribe<T = ReturnType<B['_subscribe']>>(events: string | string[]): T {
		if (!Array.isArray(events)) events = [events];
		for (const event of events) this.subscribedEvents.add(event);
		return this.broker._subscribe(events);
	}

	public unsubscribe<T = ReturnType<B['_unsubscribe']>>(events: string | string[]): T {
		if (!Array.isArray(events)) events = [events];
		for (const event of events) this.subscribedEvents.delete(event);
		return this.broker._unsubscribe(events);
	}

}
