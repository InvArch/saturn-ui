import { Rings, SubIdStartUrl } from '../data/rings';

export type ResultBalances = Array<Record<string, {
	freeBalance: string;
	reservedBalance: string;
	frozenFee: string;
	totalBalance: string;
}>>;

export type ResultBalancesWithNetwork = Record<string, ResultBalances>;

export type NetworkBalances = {
	[Property in keyof typeof Rings]: ResultBalances;
};

export async function getBalancesFromNetwork(address: string, balancesUrl: string, network: string): Promise<ResultBalancesWithNetwork> {
	return fetch(
		SubIdStartUrl + address + balancesUrl,
	).then(async response => response.json().then(res => ({ [network]: res as ResultBalances })));
}

export async function getBalancesFromAllNetworks(address: string): Promise<NetworkBalances> {
	const promises = [];

	for (const [network, networkData] of Object.entries(Rings)) {
		promises.push(getBalancesFromNetwork(address, networkData.subIdBalancesUrl, network));
	}

	const results: ResultBalancesWithNetwork[] = await Promise.all(promises);

	const allBalances: NetworkBalances = Object.assign({}, ...results);

	return allBalances;
}
