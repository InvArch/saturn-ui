import { createSignal, Show, For, createEffect, type Setter } from 'solid-js';
import { type MultisigCall, type Saturn } from '@invarch/saturn-sdk';
import {
    Button,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    Input,
    Select,
    SelectTrigger,
    SelectValue,
    SelectIcon,
    SelectContent,
    SelectListbox,
    SelectOption,
    SelectOptionText,
    SelectOptionIndicator,
    Switch,
} from '@hope-ui/solid';
import { type ApiPromise } from '@polkadot/api';
import { BN } from '@polkadot/util';
import { BigNumber } from 'bignumber.js';

import { useProposeContext } from "../providers/proposeProvider";
import { NetworksByAsset, Rings } from '../data/rings';

export type TransferModalProps = {
    open: { network: string; asset: string } | undefined;
    setOpen: Setter<{ network: string; asset: string } | undefined>;
    saturn: Saturn | undefined;
    multisigId: number | undefined;
    multisigAddress: string | undefined;
    ringApis: Record<string, ApiPromise> | undefined;
};

export default function TransferModal(props: TransferModalProps) {
    const [amount, setAmount] = createSignal<BigNumber>(new BigNumber(0));
    const [possibleNetworks, setPossibleNetworks] = createSignal<string[]>([]);
    const [initialNetwork, setInitialNetwork] = createSignal<string>('');
    const [finalNetworkPair, setFinalNetworkPair] = createSignal<{ from: string; to: string }>({ from: '', to: '' });
    const [targetAddress, setTargetAddress] = createSignal<string>('');
    const [bridgeToSelf, setBridgeToSelf] = createSignal<boolean>(false);

    const [{ proposalCall }, { openProposeModal, closeProposeModal }] = useProposeContext();

    createEffect(() => {
        const a = props.open?.asset;
        const n = props.open?.network;

        if (a && n && NetworksByAsset[a]) {
            setPossibleNetworks(NetworksByAsset[a]);
            setInitialNetwork(n);
            setFinalNetworkPair({ from: n, to: n });
        }
    });

    const proposeTransfer = async () => {
        const asset = props.open?.asset;

        if (!props.saturn || typeof props.multisigId !== 'number' || !props.multisigAddress || !props.ringApis || !asset || amount().lte(0)) {
            return;
        }

        const pair = finalNetworkPair();

        console.log('pair: ', pair);
        console.log('asset: ', asset);

        let call;

        if (pair.from == 'tinkernet' && pair.to == 'tinkernet') {
            if (asset == 'TNKR') {
                call = props.ringApis.tinkernet.tx.balances.transferKeepAlive(targetAddress(), amount().times(BigNumber('10').pow(
                    Rings.tinkernet.decimals,
                )).toString()).unwrap().toU8a();
            } else if (asset == 'KSM') {
                call = props.ringApis.tinkernet.tx.tokens.transferKeepAlive(targetAddress(), 1, amount().times(BigNumber('10').pow(
                    BigNumber(Rings.tinkernet.decimals),
                )).toString()).unwrap().toU8a();
            }
        } else if (pair.from == 'tinkernet' && pair.to != 'tinkernet') {
            // Handle bridging TNKR or KSM from Tinkernet to other chains.
        } else if (pair.from != 'tinkernet' && pair.from != pair.to) {
            // Handle bridging assets between other chains.
            const assetXcmRep = props.saturn.chains.find(c => c.chain.toLowerCase() == pair.from)?.assets.find(a => a.label == asset)?.registerType;

            console.log(assetXcmRep);

            if (!assetXcmRep || !props.ringApis?.[pair.from]) {
                return;
            }

            const estimateFee = (await props.ringApis[pair.from].tx.polkadotXcm.reserveTransferAssets(
                { v1: { parents: 1, interior: "Here" } },
                { v1: { parents: 0, interior: "Here" } },
                { v1: [{ id: { concrete: { v1: { parents: 0, interior: "Here" } } }, fun: { fungible: amount().toString() } }] },
                0
            ).paymentInfo(props.multisigAddress)).partialFee;

            call = props.saturn.bridgeXcmAsset({
                id: props.multisigId,
                asset: assetXcmRep,
                amount: new BN(amount().times(BigNumber('10').pow(
                    BigNumber(Rings[pair.from as keyof typeof Rings].decimals),
                )).toString()),
                destination: pair.to,
                to: bridgeToSelf() ? undefined : targetAddress(),
                xcmFee: estimateFee.mul(new BN('2')),
            });
        } else if (pair.from != 'tinkernet' && pair.from == pair.to) {
            // Handle balance transfer of assets within another chain.
            const assetXcmRep = props.saturn.chains.find(c => c.chain.toLowerCase() == pair.from)?.assets.find(a => a.label == asset)?.registerType;

            console.log(assetXcmRep);

            if (!assetXcmRep || !props.ringApis?.[pair.from]) {
                return;
            }

            const estimateFee = (await props.ringApis[pair.from].tx.balances.transfer(targetAddress(), amount().times(BigNumber('10').pow(
                BigNumber(Rings[pair.from as keyof typeof Rings].decimals),
            )).toString()).paymentInfo(props.multisigAddress)).partialFee;

            call = props.saturn.transferXcmAsset({
                id: props.multisigId,
                asset: assetXcmRep,
                amount: new BN(amount().times(BigNumber('10').pow(
                    BigNumber(Rings[pair.from as keyof typeof Rings].decimals),
                )).toString()),
                to: targetAddress(),
                xcmFeeAsset: assetXcmRep,
                xcmFee: estimateFee.mul(new BN('2')),
            });
        }

        if (call) {
            openProposeModal(call);

            // props.setCurrentCall(call);
            // props.setProposeModalOpen(true);

            props.setOpen(undefined);
        }
    };

    return (
        <Modal opened={Boolean(props.open)} onClose={() => {
            props.setOpen(undefined);
        }}>
            <ModalOverlay />
            <ModalContent>
                <ModalCloseButton />
                <ModalHeader>Propose Asset Transfer</ModalHeader>
                <ModalBody>
                    <div class='flex flex-col gap-1'>
                        <div class='flex flex-row'>
                            <Select value={finalNetworkPair().from} onChange={v => setFinalNetworkPair({ from: v, to: finalNetworkPair().to })}>
                                <SelectTrigger>
                                    <SelectValue class='capitalize' />
                                    <SelectIcon />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectListbox>
                                        <For each={possibleNetworks()}>
                                            {item => (
                                                <SelectOption value={item}>
                                                    <SelectOptionText class='capitalize'>{item}</SelectOptionText>
                                                    <SelectOptionIndicator />
                                                </SelectOption>
                                            )}
                                        </For>
                                    </SelectListbox>
                                </SelectContent>
                            </Select>
                            <Select value={finalNetworkPair().to} onChange={v => setFinalNetworkPair({ from: finalNetworkPair().from, to: v })}>
                                <SelectTrigger>
                                    <SelectValue class='capitalize' />
                                    <SelectIcon />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectListbox>
                                        <For each={possibleNetworks()}>
                                            {item => (
                                                <SelectOption value={item}>
                                                    <SelectOptionText class='capitalize'>{item}</SelectOptionText>
                                                    <SelectOptionIndicator />
                                                </SelectOption>
                                            )}
                                        </For>
                                    </SelectListbox>
                                </SelectContent>
                            </Select>
                        </div>
                        <Show when={finalNetworkPair().from != finalNetworkPair().to}>
                            <Switch defaultChecked={false} onChange={e => setBridgeToSelf(!bridgeToSelf())}>Bridge To Self</Switch>
                        </Show>
                        <Input
                            placeholder='Address'
                            value={bridgeToSelf() ? props.multisigAddress : targetAddress()}
                            disabled={bridgeToSelf()}
                            onInput={e => setTargetAddress(e.currentTarget.value)}
                        />
                        <Input
                            placeholder='Amount'
                            value={amount().toString()}
                            onInput={e => {
                                const a = parseInt(e.currentTarget.value);
                                if (typeof a === 'number') {
                                    setAmount(new BigNumber(a));
                                }
                            }}
                        />
                        <Button onClick={() => proposeTransfer()}>Propose</Button>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button onClick={() => {
                        props.setOpen(undefined);
                    }}>Cancel</Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
