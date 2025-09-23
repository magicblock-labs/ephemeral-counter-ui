import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "./components/Button";
import Square from "./components/Square";
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Alert from "./components/Alert";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program, Provider } from "@coral-xyz/anchor";
import { SimpleProvider } from "./components/Wallet";
import {
    AccountInfo,
    Commitment,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction, TransactionInstruction
} from "@solana/web3.js";

const COUNTER_PDA_SEED = "test-pda";
//const COUNTER_PROGRAM = new PublicKey("852a53jomx7dGmkpbFPGXNJymRxywo3WsH1vusNASJRr");
const COUNTER_PROGRAM = new PublicKey("9javwxMaxnEb7gguTnTr6Bgb8HRNxWvBNKAUjg3SiXMV");
const MINTER_PROGRAM = new PublicKey("HfPTAU1bZBHPqcpEGweinAH9zsPafYnnaxk4k5xsTU3M");

export const admin = anchor.web3.Keypair.fromSecretKey(Uint8Array.from([253, 10, 149, 82, 131, 188, 183, 151, 158, 44, 73, 91, 174, 72, 6, 46, 18, 145, 15, 114, 9, 197, 106, 230, 153, 58, 2, 61, 250, 229, 64, 206, 150, 12, 231, 71, 168, 70, 194, 36, 149, 232, 43, 104, 73, 202, 187, 141, 196, 201, 107, 161, 218, 75, 76, 217, 67, 139, 220, 181, 103, 181, 68, 176]));

//const anchorProvider = anchor.AnchorProvider.local("http://127.0.0.1:8899");
//anchor.setProvider(anchorProvider);

const ephemeralCounterGlobal = "A1wk6oPVA6FFSwqnW7XE4EigE7oDcnQ6AV1V8dikD3wo";

const App: React.FC = () => {
    console.info("admin: ", admin.publicKey.toBase58());
    let { connection } = useConnection();
    //let connection = anchorProvider.connection;

    const ephemeralConnection = useRef<Connection | null>(null);

    const provider = useRef<Provider>(new SimpleProvider(connection, admin.publicKey));


    //const { publicKey, sendTransaction } = useWallet();
    const publicKey = admin.publicKey;

    const tempKeypair = useRef<Keypair | null>(null);
    const [counter, setCounter] = useState<number>(0);
    const [ephemeralCounter, setEphemeralCounter] = useState<number>(0);
    const [isDelegated, setIsDelegated] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [transactionError, setTransactionError] = useState<string | null>(null);
    const [transactionSuccess, setTransactionSuccess] = useState<string | null>(null);
    const counterProgramClient = useRef<Program | null>(null);
    // const minterProgramClient = useRef<Program | null>(null);
    const [counterPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(COUNTER_PDA_SEED)],
        COUNTER_PROGRAM
    );
    let counterSubscriptionId = useRef<number | null>(null);
    let ephemeralCounterSubscriptionId = useRef<number | null>(null);

    // Helpers to Dynamically fetch the IDL and initialize the program client
    const getProgramClient = useCallback(async (program: PublicKey): Promise<Program> => {
        const idl = await Program.fetchIdl(program, provider.current);
        if (!idl) throw new Error(`IDL not found : ${program.toBase58()}`);
        return new Program(idl, provider.current);
    }, [provider]);

    // Define callbacks function to handle account changes
    const handleCounterChange = useCallback((accountInfo: AccountInfo<Buffer>) => {
        console.error("Ephemeral counter changed", accountInfo);
        if (!counterProgramClient.current) return;
        const decodedData = counterProgramClient.current.coder.accounts.decode('counter', accountInfo.data);
        setIsDelegated(!accountInfo.owner.equals(counterProgramClient.current.programId));
        setCounter(Number(decodedData.count));
    }, []);

    const handleEphemeralCounterChange = useCallback((accountInfo: AccountInfo<Buffer>) => {
        console.log("Ephemeral counter changed: ", accountInfo, counterProgramClient.current?.programId);
        if (!counterProgramClient.current) return;
        const decodedData = counterProgramClient.current.coder.accounts.decode('counter', accountInfo.data);
        setEphemeralCounter(Number(decodedData.count));
    }, []);

    // Subscribe to the counters updates
    const subscribeToCounter = useCallback(async (): Promise<void> => {
        if (counterSubscriptionId && counterSubscriptionId.current) await connection.removeAccountChangeListener(counterSubscriptionId.current);
        console.info("Subscribing to counter", counterPda.toBase58());
        // Subscribe to counter changes
        counterSubscriptionId.current = connection.onAccountChange(counterPda, handleCounterChange, 'processed');
    }, [connection, counterPda, handleCounterChange]);

    // Subscribe to the ephemeral counter updates
    const subscribeToEphemeralCounter = useCallback(async (): Promise<void> => {
        if (!ephemeralConnection.current) return;
        console.log("Subscribing to ephemeral counter", counterPda.toBase58());
        if (ephemeralCounterSubscriptionId && ephemeralCounterSubscriptionId.current) await ephemeralConnection.current.removeAccountChangeListener(ephemeralCounterSubscriptionId.current);
        // Subscribe to ephemeral counter changes
        ephemeralCounterSubscriptionId.current = ephemeralConnection.current.onAccountChange(counterPda, handleEphemeralCounterChange, 'confirmed');
    }, [counterPda, handleEphemeralCounterChange]);

    const [counterProgramClientInitialized, setCounterProgramClientInitialized] = useState(false);

    useEffect(() => {
        const initializeProgramClient = async () => {
            //console.log("initializeProgramClient entered");
            if (counterProgramClient.current) return;
            counterProgramClient.current = await getProgramClient(COUNTER_PROGRAM);
            //console.log("counterProgramClient initialized");
            // minterProgramClient.current = await getProgramClient(MINTER_PROGRAM);
            const accountInfo = await provider.current.connection.getAccountInfo(counterPda);
            if (accountInfo) {
                console.info("counterPda eixsts, use its counter: ", accountInfo);
                // @ts-ignore
                const counter = await counterProgramClient.current.account.counter.fetch(counterPda);
                setCounter(Number(counter.count.valueOf()));
                setIsDelegated(!accountInfo.owner.equals(COUNTER_PROGRAM));
                await subscribeToCounter();
            }
            setCounterProgramClientInitialized(true);
        };
        initializeProgramClient().catch(console.error);
    }, [connection, counterPda, getProgramClient, subscribeToCounter]);

    // Detect when publicKey is set/connected
    useEffect(() => {
        if (!publicKey) return;
        if (!publicKey || Keypair.fromSeed(publicKey.toBytes()).publicKey.equals(tempKeypair.current?.publicKey || PublicKey.default)) return;
        console.log("Wallet connected with publicKey:", publicKey.toBase58());
        // Derive the temp keypair from the publicKey
        const newTempKeypair = Keypair.fromSeed(publicKey.toBytes());
        tempKeypair.current = newTempKeypair;
        console.log("Temp Keypair", newTempKeypair.publicKey.toBase58());
    }, [connection, publicKey]);

    useEffect(() => {
        const checkAndTransfer = async () => {
            if (tempKeypair.current) {
                const accountTmpWallet = await connection.getAccountInfo(tempKeypair.current.publicKey);
                if (!accountTmpWallet || accountTmpWallet.lamports <= 0.01 * LAMPORTS_PER_SOL) {
                    await transferToTempKeypair()
                }
            }
        };
        checkAndTransfer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDelegated, connection]);

    useEffect(() => {
        //console.log("initializeEphemeralConnection");
        const initializeEphemeralConnection = async () => {
            //console.log("initializeEphemeralConnection");
            //const cluster = process.env.REACT_APP_MAGICBLOCK_URL || "https://devnet.magicblock.app"
            const cluster = "http://localhost:8899";
            if (ephemeralConnection.current || counterProgramClient.current == null) {
                //console.warn("initializeEphemeralConnection early return", ephemeralConnection.current, counterProgramClient.current);
                return;
            }
            // console.info("ephemeralConnection is setting up");

            ephemeralConnection.current = new Connection(cluster);
            // Airdrop to trigger lazy reload
            try {
                await ephemeralConnection.current?.requestAirdrop(counterPda, 1);
            } catch (_) {
                console.log("Refreshed account in the ephemeral");
            }
            const accountInfo = await ephemeralConnection.current.getAccountInfo(counterPda);
            if (accountInfo) {
                // @ts-ignore
                const counter = await counterProgramClient.current.coder.accounts.decode("counter", accountInfo.data);
                setEphemeralCounter(Number(counter.count.valueOf()));
                await subscribeToCounter();
            }
            await subscribeToEphemeralCounter();
        };
        initializeEphemeralConnection().catch(console.error);
    }, [counterPda, counterProgramClientInitialized, subscribeToCounter, subscribeToEphemeralCounter]);

    const updateCounter = async (_: number): Promise<void> => {
        await increaseCounterTx();
    };


    const submitTransaction = useCallback(async (transaction: Transaction, useTempKeypair: boolean = false, ephemeral: boolean = false, confirmCommitment: Commitment = "processed"): Promise<string | null> => {
        if (!tempKeypair.current) {
            console.log("tempKeypair is not set");
            return null;
        }

        if (!publicKey) {
            console.log("publicKey is not set");
            return null;
        }

        if (!ephemeralConnection.current) {
            console.log("ephemeralConnection is not set");
            return null;
        }

        //if (isSubmitting) return null;
        setIsSubmitting(true);
        setTransactionError(null);
        setTransactionSuccess(null);
        let connection = ephemeral ? ephemeralConnection.current : provider.current.connection;
        try {
            const {
                context: { slot: minContextSlot },
                value: { blockhash, lastValidBlockHeight }
            } = await connection.getLatestBlockhashAndContext();
            console.log("Submitting transaction...", minContextSlot, blockhash, lastValidBlockHeight);
            if (!transaction.recentBlockhash) transaction.recentBlockhash = blockhash;
            if (!transaction.feePayer) useTempKeypair ? transaction.feePayer = tempKeypair.current.publicKey : transaction.feePayer = publicKey;
            if (useTempKeypair) transaction.sign(tempKeypair.current);
            let signature;
            if (!ephemeral && !useTempKeypair) {
                signature = await connection.sendTransaction(transaction, [admin], { minContextSlot });
            } else {
                signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
            }
            await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, confirmCommitment);
            // Transaction was successful
            console.log(`Transaction confirmed: ${signature}`);
            setTransactionSuccess(`Transaction confirmed`);
            return signature;
        } catch (error) {
            setTransactionError(`Transaction failed: ${error}`);
        } finally {
            setIsSubmitting(false);
        }
        return null;
    }, [publicKey, tempKeypair]);

    /**
     * Transfer some SOL to temp keypair
     */
    const transferToTempKeypair = useCallback(async () => {
        if (!publicKey || !tempKeypair.current) return;
        console.log("Transfer some SOL to temp keypair");
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: tempKeypair.current.publicKey,
                lamports: 0.1 * LAMPORTS_PER_SOL,
            })
        );
        transaction.feePayer = publicKey;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        await submitTransaction(transaction);
    }, [publicKey, tempKeypair, connection, submitTransaction]);

    /**
     * Increase counter transaction
     */
    const increaseCounterTx = useCallback(async () => {
        console.log("tempKeypair: ", tempKeypair);
        if (!tempKeypair.current) return;
        if (!isDelegated) {
            const accountTmpWallet = await connection.getAccountInfo(tempKeypair.current.publicKey);
            if (!accountTmpWallet || accountTmpWallet.lamports <= 0.01 * LAMPORTS_PER_SOL) {
                await transferToTempKeypair()
            }
        }

        const transaction = await counterProgramClient.current?.methods
            .increment()
            .accounts({
                counter: counterPda,
            }).transaction() as Transaction;

        // Add instruction to print to the noop program and and make the transaction unique
        // const noopInstruction = new TransactionInstruction({
        //     programId: new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'),
        //     keys: [],
        //     data: Buffer.from(crypto.getRandomValues(new Uint8Array(5))),
        // });
        // transaction.add(noopInstruction);

        let ret = await submitTransaction(transaction, true, isDelegated);
    }, [isDelegated, counterPda, submitTransaction, connection, transferToTempKeypair]);

    /**
     * Delegate PDA transaction
     */
    const delegatePdaTx = useCallback(async () => {
        console.log("Delegate PDA transaction");
        console.log(tempKeypair.current);
        if (!tempKeypair.current) return;
        const accountTmpWallet = await connection.getAccountInfo(tempKeypair.current.publicKey);
        if (!accountTmpWallet || accountTmpWallet.lamports <= 0.01 * LAMPORTS_PER_SOL) {
            await transferToTempKeypair()
        }
        const transaction = await counterProgramClient.current?.methods
            .delegate()
            .accounts({
                payer: tempKeypair.current.publicKey,
                pda: counterPda
            })
            .transaction() as Transaction;
        setEphemeralCounter(Number(counter));
        await submitTransaction(transaction, true, false, "confirmed");
    }, [counterPda, connection, counter, submitTransaction, transferToTempKeypair]);

    /**
     * Undelegate PDA transaction
     */
    const undelegatePdaTx = useCallback(async () => {
        console.log("Undelegate PDA transaction: ", tempKeypair.current);
        if (!tempKeypair.current) return;
        console.log("Undelegate PDA transaction");
        const transaction = await counterProgramClient.current?.methods
            .undelegate()
            .accounts({
                payer: tempKeypair.current.publicKey,
                counter: counterPda,
            })
            .transaction() as Transaction;

        await submitTransaction(transaction, true, true);
    }, [tempKeypair, counterPda, submitTransaction]);

    /**
     * Mint token transaction
     */
    const mintTokenTroughPdaTx = useCallback(async () => {
        // if (!publicKey) return;
        // console.log("Mint transaction");
        // const transaction = await minterProgramClient.current?.methods
        //     .mintToken(isDelegated ? new BN(ephemeralCounter) : new BN(counter))
        //     .accounts({
        //         payer: publicKey,
        //         counter: counterPda,
        //     })
        //     .transaction() as Transaction;

        // await submitTransaction(transaction, false, false);
        // eslint-disable-next-line
    }, [publicKey, counter, counterPda, submitTransaction]);

    /**
     * -------
     */

    const delegateTx = useCallback(async () => {
        await delegatePdaTx();
    }, [delegatePdaTx]);

    const undelegateTx = useCallback(async () => {
        await undelegatePdaTx();
    }, [undelegatePdaTx]);

    const mintTokenTx = useCallback(async () => {
        await mintTokenTroughPdaTx();
    }, [mintTokenTroughPdaTx]);

    return (
        <div className="counter-ui">
            <div className="wallet-buttons">
                <WalletMultiButton />
            </div>

            <h1>Ephemeral Counter</h1>

            <div className="button-container">
                <Button title={"Delegate"} resetGame={delegateTx} disabled={isDelegated} />
                <Button title={"Undelegate"} resetGame={undelegateTx} disabled={!isDelegated} />
            </div>

            <div className="game">
                <Square
                    key="0"
                    ind={Number(0)}
                    updateSquares={(index: string | number) => updateCounter(Number(index))}
                    clsName={isDelegated ? '' : counter.toString()}
                />
                <Square
                    key="1"
                    ind={Number(1)}
                    updateSquares={(index: string | number) => updateCounter(Number(index))}
                    clsName={isDelegated ? ephemeralCounter.toString() : ''}
                />
            </div>
            {isSubmitting && (<div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                position: 'fixed',
                bottom: '20px',
                left: 0,
                width: '100%',
                zIndex: 1000,
            }}>
                <div className="spinner"></div>
            </div>
            )}

            <div className="button-container">
                <Button title={"Mint"} resetGame={mintTokenTx} />
            </div>

            {transactionError &&
                <Alert type="error" message={transactionError} onClose={() => setTransactionError(null)} />}

            {transactionSuccess &&
                <Alert type="success" message={transactionSuccess} onClose={() => setTransactionSuccess(null)} />}

            <img src={`${process.env.PUBLIC_URL}/magicblock_white.png`} alt="Magic Block Logo"
                className="magicblock-logo" />
        </div>
    );
};

export default App;
