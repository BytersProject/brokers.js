import { EventEmitter } from 'events';
import { Broker } from './structures/Broker';

export class Brokers extends EventEmitter {

	// eslint-disable-next-line @typescript-eslint/naming-convention
	public readonly broker: Broker<unknown, unknown>;

	public constructor(broker: Broker<unknown, unknown>) {
		super();

		this.broker = broker;
	}

	public start(...args: any[]) {
		return this.broker.start(...args);
	}

}
