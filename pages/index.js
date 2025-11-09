import { useState, useEffect, useCallback } from 'react';
import { useAccount, useProvider, useSigner } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract';
import styles from '../styles/Home.module.css';

export default function Home() {
  const { address, isConnected } = useAccount();
  const provider = useProvider();
  const { data: signer } = useSigner();
  const [contract, setContract] = useState(null);
  const [marketCount, setMarketCount] = useState(0);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userStakes, setUserStakes] = useState({});

  // Create market form state
  const [newQuestion, setNewQuestion] = useState('');
  const [newOutcomes, setNewOutcomes] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  // Bet form state
  const [betMarketId, setBetMarketId] = useState('');
  const [betOutcome, setBetOutcome] = useState('');
  const [betAmount, setBetAmount] = useState('');

  // Resolve form state
  const [resolveMarketId, setResolveMarketId] = useState('');
  const [resolveOutcome, setResolveOutcome] = useState('');

  useEffect(() => {
    if (provider && signer) {
      const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setContract(contractInstance);
    }
  }, [provider, signer]);

  const loadMarkets = useCallback(async () => {
    if (!contract || !provider) return;
    try {
      const count = await contract.marketCount();
      setMarketCount(count.toNumber());
      
      const marketList = [];
      const stakes = {};
      for (let i = 0; i < count.toNumber(); i++) {
        try {
          const market = await contract.getMarketBasic(i);
          marketList.push({
            id: i,
            owner: market.owner,
            question: market.question,
            deadline: market.deadline.toNumber(),
            resolved: market.resolved,
            winningOutcome: market.winningOutcome.toNumber(),
            totalStaked: ethers.utils.formatEther(market.totalStaked),
            outcomeStakes: market.outcomeStakes.map(s => ethers.utils.formatEther(s)),
            outcomes: market.outcomes,
          });
          
          // Load user stakes for this market
          if (address && market.outcomes.length > 0) {
            stakes[i] = {};
            for (let j = 0; j < market.outcomes.length; j++) {
              try {
                const stake = await contract.userStakeIn(i, address, j);
                stakes[i][j] = ethers.utils.formatEther(stake);
              } catch (err) {
                stakes[i][j] = '0';
              }
            }
          }
        } catch (err) {
          console.error(`Error loading market ${i}:`, err);
        }
      }
      setMarkets(marketList);
      setUserStakes(stakes);
    } catch (err) {
      console.error('Error loading markets:', err);
    }
  }, [contract, provider, address]);

  useEffect(() => {
    if (contract && address) {
      loadMarkets();
    }
  }, [contract, address, loadMarkets]);

  const createMarket = async (e) => {
    e.preventDefault();
    if (!contract || !signer) return;
    setLoading(true);
    try {
      const outcomes = newOutcomes.split(',').map(o => o.trim()).filter(o => o);
      const deadline = Math.floor(new Date(newDeadline).getTime() / 1000);
      
      const tx = await contract.createMarket(newQuestion, outcomes, deadline);
      await tx.wait();
      
      setNewQuestion('');
      setNewOutcomes('');
      setNewDeadline('');
      await loadMarkets();
      alert('Market created successfully!');
    } catch (err) {
      console.error('Error creating market:', err);
      alert('Error creating market: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const placeBet = async (e) => {
    e.preventDefault();
    if (!contract || !signer) return;
    setLoading(true);
    try {
      const amount = ethers.utils.parseEther(betAmount);
      const tx = await contract.placeBet(betMarketId, betOutcome, { value: amount });
      await tx.wait();
      
      setBetMarketId('');
      setBetOutcome('');
      setBetAmount('');
      await loadMarkets();
      alert('Bet placed successfully!');
    } catch (err) {
      console.error('Error placing bet:', err);
      alert('Error placing bet: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const resolveMarket = async (e) => {
    e.preventDefault();
    if (!contract || !signer) return;
    setLoading(true);
    try {
      const tx = await contract.resolveMarket(resolveMarketId, resolveOutcome);
      await tx.wait();
      
      setResolveMarketId('');
      setResolveOutcome('');
      await loadMarkets();
      alert('Market resolved successfully!');
    } catch (err) {
      console.error('Error resolving market:', err);
      alert('Error resolving market: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const claimWinnings = async (marketId) => {
    if (!contract || !signer) return;
    setLoading(true);
    try {
      const tx = await contract.claim(marketId);
      await tx.wait();
      
      await loadMarkets();
      alert('Winnings claimed successfully!');
    } catch (err) {
      console.error('Error claiming winnings:', err);
      alert('Error claiming winnings: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Predict & Win — Polymarket-style</h1>
        <ConnectButton />
      </header>

      {!isConnected && (
        <div className={styles.card}>
          <p>Please connect your wallet to continue.</p>
        </div>
      )}

      {isConnected && (
        <>
          {/* Create Market Section */}
          <div className={styles.card}>
            <h2>Create New Market</h2>
            <form onSubmit={createMarket}>
              <div>
                <label className={styles.label}>Question</label>
                <input
                  type="text"
                  className={styles.input}
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="Will it rain tomorrow?"
                  required
                />
              </div>
              <div>
                <label className={styles.label}>Outcomes (comma-separated)</label>
                <input
                  type="text"
                  className={styles.input}
                  value={newOutcomes}
                  onChange={(e) => setNewOutcomes(e.target.value)}
                  placeholder="Yes, No"
                  required
                />
              </div>
              <div>
                <label className={styles.label}>Deadline</label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className={styles.button} disabled={loading}>
                Create Market
              </button>
            </form>
          </div>

          {/* Place Bet Section */}
          <div className={styles.card}>
            <h2>Place Bet</h2>
            <form onSubmit={placeBet}>
              <div>
                <label className={styles.label}>Market ID</label>
                <input
                  type="number"
                  className={styles.input}
                  value={betMarketId}
                  onChange={(e) => setBetMarketId(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className={styles.label}>Outcome Index</label>
                <input
                  type="number"
                  className={styles.input}
                  value={betOutcome}
                  onChange={(e) => setBetOutcome(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className={styles.label}>Amount (ETH)</label>
                <input
                  type="text"
                  className={styles.input}
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="0.1"
                  required
                />
              </div>
              <button type="submit" className={styles.button} disabled={loading}>
                Place Bet
              </button>
            </form>
          </div>

          {/* Resolve Market Section */}
          <div className={styles.card}>
            <h2>Resolve Market (Owner Only)</h2>
            <form onSubmit={resolveMarket}>
              <div>
                <label className={styles.label}>Market ID</label>
                <input
                  type="number"
                  className={styles.input}
                  value={resolveMarketId}
                  onChange={(e) => setResolveMarketId(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className={styles.label}>Winning Outcome Index</label>
                <input
                  type="number"
                  className={styles.input}
                  value={resolveOutcome}
                  onChange={(e) => setResolveOutcome(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
              <button type="submit" className={styles.button} disabled={loading}>
                Resolve Market
              </button>
            </form>
          </div>

          {/* Markets List */}
          <div className={styles.card}>
            <h2>Markets ({marketCount})</h2>
            {markets.length === 0 ? (
              <p>No markets created yet.</p>
            ) : (
              markets.map((market) => (
                <div key={market.id} className={styles.marketCard}>
                  <h3>Market #{market.id}: {market.question}</h3>
                  <p><strong>Owner:</strong> {market.owner}</p>
                  <p><strong>Deadline:</strong> {formatDate(market.deadline)}</p>
                  <p><strong>Status:</strong> {market.resolved ? `Resolved - Winner: ${market.outcomes[market.winningOutcome]}` : 'Active'}</p>
                  <p><strong>Total Staked:</strong> {market.totalStaked} ETH</p>
                  <div>
                    <strong>Outcomes:</strong>
                    <ul>
                      {market.outcomes.map((outcome, idx) => (
                        <li key={idx}>
                          {outcome}: {market.outcomeStakes[idx]} ETH
                        </li>
                      ))}
                    </ul>
                  </div>
                  {market.resolved && address && userStakes[market.id] && 
                   parseFloat(userStakes[market.id][market.winningOutcome] || '0') > 0 && (
                    <button
                      onClick={() => claimWinnings(market.id)}
                      className={styles.button}
                      disabled={loading}
                    >
                      Claim Winnings ({userStakes[market.id][market.winningOutcome]} ETH staked)
                    </button>
                  )}
                  {address && userStakes[market.id] && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      <strong>Your stakes:</strong>{' '}
                      {market.outcomes.map((outcome, idx) => (
                        <span key={idx}>
                          {outcome}: {userStakes[market.id][idx] || '0'} ETH
                          {idx < market.outcomes.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

