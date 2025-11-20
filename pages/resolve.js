import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAccount, useProvider, useSigner } from 'wagmi';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract';
import styles from '../styles/ResolveMarket.module.css';

export default function ResolveMarketPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const provider = useProvider();
  const { data: signer } = useSigner();

  const [contract, setContract] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [resolveMarketId, setResolveMarketId] = useState('');
  const [resolveOutcome, setResolveOutcome] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingTx, setPendingTx] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (provider && signer) {
      const instance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setContract(instance);
    }
  }, [provider, signer]);

  const loadMarkets = useCallback(async () => {
    if (!contract || !address) return;
    try {
      const count = await contract.marketCount();
      const list = [];
      for (let i = 0; i < count.toNumber(); i++) {
        const market = await contract.getMarketBasic(i);
        list.push({
          id: i,
          owner: market.owner,
          question: market.question,
          deadline: market.deadline.toNumber(),
          resolved: market.resolved,
          winningOutcome: market.winningOutcome.toNumber(),
          totalStaked: ethers.utils.formatEther(market.totalStaked),
          outcomes: market.outcomes,
        });
      }
      setMarkets(list);
    } catch (err) {
      console.error('Error loading markets:', err);
      setErrorMessage(err.message || 'Failed to load markets');
    }
  }, [contract, address]);

  useEffect(() => {
    if (contract && address) {
      loadMarkets();
    }
  }, [contract, address, loadMarkets]);

  useEffect(() => {
    if (router.query.market) {
      setResolveMarketId(router.query.market.toString());
    }
  }, [router.query.market]);

  const eligibleMarkets = useMemo(() => {
    if (!address) return [];
    return markets.filter((market) => {
      if (market.owner.toLowerCase() !== address.toLowerCase()) return false;
      if (market.resolved) return false;
      return new Date(market.deadline * 1000) < new Date();
    });
  }, [markets, address]);

  const selectedMarket = resolveMarketId
    ? markets.find((m) => m.id.toString() === resolveMarketId)
    : null;

  const getBlockExplorerUrl = (txHash) => `https://sepolia.basescan.org/tx/${txHash}`;

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!contract || !resolveMarketId || resolveOutcome === '') return;

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const tx = await contract.resolveMarket(resolveMarketId, resolveOutcome);
      setPendingTx(tx.hash);
      await tx.wait();
      setPendingTx(null);
      setSuccessMessage('Market resolved successfully!');
      setResolveOutcome('');
      await loadMarkets();
    } catch (err) {
      console.error('Error resolving market:', err);
      setPendingTx(null);
      setErrorMessage(err.message || 'Failed to resolve market');
    } finally {
      setLoading(false);
    }
  };

  const deadlineLabel = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.card}>
          <div className={styles.titleRow}>
            <div>
              <h1 className={styles.pageTitle}>Resolve Market</h1>
              <p className={styles.subtitle}>Owner only</p>
              <p className={styles.helperText}>
                Select one of your expired markets and mark the winning outcome.
              </p>
            </div>
            <button className={styles.ghostButton} onClick={() => router.push('/')}>
              ← Back to Markets
            </button>
          </div>

          {!isConnected && (
            <div className={`${styles.alert} ${styles.error}`}>
              Connect your wallet to resolve markets.
            </div>
          )}

          {errorMessage && (
            <div className={`${styles.alert} ${styles.error}`}>{errorMessage}</div>
          )}

          {successMessage && (
            <div className={`${styles.alert} ${styles.success}`}>{successMessage}</div>
          )}

          {isConnected && eligibleMarkets.length === 0 && (
            <div className={styles.emptyState}>
              No markets available to resolve. You need to own a market that has passed its deadline.
            </div>
          )}

          {isConnected && eligibleMarkets.length > 0 && (
            <form onSubmit={handleResolve}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Select Market</label>
                <select
                  className={styles.select}
                  value={resolveMarketId}
                  onChange={(e) => {
                    setResolveMarketId(e.target.value);
                    setResolveOutcome('');
                  }}
                  required
                >
                  <option value="">-- Select a market --</option>
                  {eligibleMarkets.map((market) => (
                    <option key={market.id} value={market.id}>
                      Market #{market.id}: {market.question}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMarket && (
                <div className={styles.marketDetails}>
                  <strong>Market Details</strong>
                  <ul className={styles.detailsList}>
                    <li>Question: {selectedMarket.question}</li>
                    <li>Deadline: {deadlineLabel(selectedMarket.deadline)}</li>
                    <li>Total Staked: {selectedMarket.totalStaked} ETH</li>
                  </ul>
                  <div className={styles.outcomesGrid}>
                    {selectedMarket.outcomes.map((outcome, idx) => (
                      <span key={idx} className={styles.outcomePill}>
                        {idx}. {outcome}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedMarket && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>Winning Outcome</label>
                  <select
                    className={styles.select}
                    value={resolveOutcome}
                    onChange={(e) => setResolveOutcome(e.target.value)}
                    required
                  >
                    <option value="">-- Select outcome --</option>
                    {selectedMarket.outcomes.map((outcome, idx) => (
                      <option key={idx} value={idx}>
                        {outcome} (Index: {idx})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.buttonRow}>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={loading || !resolveMarketId || resolveOutcome === ''}
                >
                  {loading ? 'Resolving...' : 'Resolve Market'}
                </button>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => router.push('/')}
                >
                  Cancel
                </button>
              </div>

              {pendingTx && (
                <p className={styles.pendingTx}>
                  Transaction pending...{' '}
                  <a href={getBlockExplorerUrl(pendingTx)} target="_blank" rel="noopener noreferrer">
                    View on Basescan ↗
                  </a>
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
