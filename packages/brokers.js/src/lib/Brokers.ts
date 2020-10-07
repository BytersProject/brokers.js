import { Broker } from './structures/Broker';

export class Brokers {

	// TODO: yea yea... I know this might seem bad...
	// But HEY! it works.... I hope...
	public brokers = new Map<string, Broker<any, any, any>>();

}
