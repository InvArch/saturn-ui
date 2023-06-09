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

import { useProposeContext, Proposal, ProposalType } from "../providers/proposeProvider";
import { useRingApisContext } from "../providers/ringApisProvider";
import { useSaturnContext } from "../providers/saturnProvider";
import { NetworksByAsset, Rings } from '../data/rings';

export type TransferModalProps = {
    open: { network: string; asset: string } | undefined;
    setOpen: Setter<{ network: string; asset: string } | undefined>;
};

export default function TransferModal(props: TransferModalProps) {
    const [amount, setAmount] = createSignal<BigNumber>(new BigNumber(0));
    const [possibleNetworks, setPossibleNetworks] = createSignal<string[]>([]);
    const [initialNetwork, setInitialNetwork] = createSignal<string>('');
    const [finalNetworkPair, setFinalNetworkPair] = createSignal<{ from: string; to: string }>({ from: '', to: '' });
    const [targetAddress, setTargetAddress] = createSignal<string>('');
    const [bridgeToSelf, setBridgeToSelf] = createSignal<boolean>(false);

    const proposeContext = useProposeContext();
    const ringApisContext = useRingApisContext();
    const saturnContext = useSaturnContext();

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

        const pair = finalNetworkPair();

        if (
            !saturnContext.state.saturn ||
            typeof saturnContext.state.multisigId !== 'number' ||
            !saturnContext.state.multisigAddress ||
            !ringApisContext.state[pair.from] ||
            !asset || amount().lte(0)
        ) {
            return;
        }

        if (pair.from == 'tinkernet' && pair.to == 'tinkernet') {
            const amountPlank = amount().times(BigNumber('10').pow(
                Rings.tinkernet.decimals,
            ));

            proposeContext.setters.openProposeModal(
                new Proposal(ProposalType.LocalTransfer, { chain: "tinkernet", asset, amount: amountPlank, to: targetAddress() })
            );

        } else if (pair.from == 'tinkernet' && pair.to != 'tinkernet') {
            // Handle bridging TNKR or KSM from Tinkernet to other chains.
        } else if (pair.from != 'tinkernet' && pair.from != pair.to) {
            // Handle bridging assets between other chains.

            const amountPlank = amount().times(BigNumber('10').pow(
                BigNumber(Rings[pair.from as keyof typeof Rings].decimals),
            ));

            proposeContext.setters.openProposeModal(
                new Proposal(ProposalType.XcmBridge, { chain: pair.from, destinationChain: pair.to, asset, amount: amountPlank, to: bridgeToSelf() ? undefined : targetAddress() })
            );

        } else if (pair.from != 'tinkernet' && pair.from == pair.to) {
            // Handle balance transfer of assets within another chain.

            const amountPlank = amount().times(BigNumber('10').pow(
                BigNumber(Rings[pair.from as keyof typeof Rings].decimals),
            ));

            proposeContext.setters.openProposeModal(
                new Proposal(ProposalType.XcmTransfer, { chain: pair.from, asset, amount: amountPlank, to: targetAddress() })
            );
        }

        props.setOpen(undefined);
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
                            value={bridgeToSelf() ? saturnContext.state.multisigAddress : targetAddress()}
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
