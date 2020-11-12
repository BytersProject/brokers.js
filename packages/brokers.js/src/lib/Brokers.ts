import { EventEmitter } from 'events';
import { Broker } from './structures/Broker';

export class Brokers<B extends Broker<any, any> = Broker<any, any>> extends EventEmitter {

	public readonly broker: B;
	public readonly subscribedEvents = new Set<string>();

	public constructor(broker: B) {
		super();

		this.broker = broker;
		this.broker.__init(this);
	}

	public start<T = ReturnType<B['start']>>(...args: Parameters<B['start']>): T {
		return this.broker.start(...args);
	}

	public publish<T = ReturnType<B['publish']>>(...args: Parameters<B['publish']>): T {
		// @ts-expect-error Expected 2-3 arguments, but got 0 or more.ts(2556)
		return this.broker.publish(...args);
	}

	public call<T = ReturnType<B['call']>>(...args: Parameters<B['call']>): T {
		// @ts-expect-error Expected at least 2 arguments, but got 0 or more.ts(2557)
		return this.broker.call(...args);
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
