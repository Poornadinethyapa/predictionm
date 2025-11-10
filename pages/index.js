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

  // Bet modal state
  const [betModalOpen, setBetModalOpen] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
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

  const openBetModal = (marketId, outcomeIndex) => {
    if (!marketId && marketId !== 0) return;
    const market = markets.find(m => m.id === marketId);
    if (!market || market.resolved) return;
    if (new Date(market.deadline * 1000) < new Date()) {
      alert('This market has passed its deadline.');
      return;
    }
    setSelectedMarket(market);
    setSelectedOutcome(outcomeIndex);
    setBetAmount('');
    setBetModalOpen(true);
  };

  const closeBetModal = () => {
    setBetModalOpen(false);
    setSelectedMarket(null);
    setSelectedOutcome(null);
    setBetAmount('');
  };

  const placeBet = async (e) => {
    e.preventDefault();
    if (!contract || !signer || selectedMarket === null || selectedOutcome === null) return;
    if (!betAmount || parseFloat(betAmount) <= 0) {
      alert('Please enter a valid bet amount');
      return;
    }
    setLoading(true);
    try {
      const amount = ethers.utils.parseEther(betAmount);
      const tx = await contract.placeBet(selectedMarket.id, selectedOutcome, { value: amount });
      await tx.wait();
      
      closeBetModal();
      await loadMarkets();
      alert('Bet placed successfully!');
    } catch (err) {
      console.error('Error placing bet:', err);
      alert('Error placing bet: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const calculateProbability = (stake, totalStake) => {
    if (parseFloat(totalStake) === 0) return 50; // Default to 50% if no stakes
    return ((parseFloat(stake) / parseFloat(totalStake)) * 100).toFixed(1);
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
        <h1>Predict & Win</h1>
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
                <label className={styles.label}>Outcomes (comma-separated, e.g., "Yes, No")</label>
                <input
                  type="text"
                  className={styles.input}
                  value={newOutcomes}
                  onChange={(e) => setNewOutcomes(e.target.value)}
                  placeholder="Yes, No"
                  required
                />
                <small style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                  Note: The UI is optimized for Yes/No markets. Other outcomes will still work but may not display optimally.
                </small>
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


          {/* Resolve Market Section */}
          <div id="resolve-section" className={styles.card}>
            <h2>Resolve Market (Owner Only)</h2>
            <p style={{ color: '#94a3b8', marginBottom: '1rem', fontSize: '0.875rem' }}>
              Select a market you own that has passed its deadline to resolve it.
            </p>
            <form onSubmit={resolveMarket}>
              <div>
                <label className={styles.label}>Select Market</label>
                <select
                  className={styles.input}
                  value={resolveMarketId}
                  onChange={(e) => {
                    setResolveMarketId(e.target.value);
                    setResolveOutcome(''); // Reset outcome when market changes
                  }}
                  required
                >
                  <option value="">-- Select a market --</option>
                  {markets
                    .filter(market => 
                      market.owner.toLowerCase() === address?.toLowerCase() && 
                      !market.resolved &&
                      new Date(market.deadline * 1000) < new Date()
                    )
                    .map(market => (
                      <option key={market.id} value={market.id}>
                        Market #{market.id}: {market.question} (Deadline: {formatDate(market.deadline)})
                      </option>
                    ))}
                </select>
                {markets.filter(m => 
                  m.owner.toLowerCase() === address?.toLowerCase() && 
                  !m.resolved &&
                  new Date(m.deadline * 1000) < new Date()
                ).length === 0 && (
                  <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    No markets available to resolve. You need to own a market that has passed its deadline.
                  </p>
                )}
              </div>
              {resolveMarketId && (() => {
                const selectedMarket = markets.find(m => m.id.toString() === resolveMarketId);
                if (!selectedMarket) return null;
                return (
                  <div>
                    <label className={styles.label}>Select Winning Outcome</label>
                    <select
                      className={styles.input}
                      value={resolveOutcome}
                      onChange={(e) => setResolveOutcome(e.target.value)}
                      required
                    >
                      <option value="">-- Select winning outcome --</option>
                      {selectedMarket.outcomes.map((outcome, idx) => (
                        <option key={idx} value={idx}>
                          {outcome} (Index: {idx})
                        </option>
                      ))}
                    </select>
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(148, 163, 184, 0.1)', borderRadius: '6px', fontSize: '0.875rem', color: '#cbd5e1' }}>
                      <strong>Market Details:</strong>
                      <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
                        <li>Question: {selectedMarket.question}</li>
                        <li>Deadline: {formatDate(selectedMarket.deadline)}</li>
                        <li>Total Staked: {selectedMarket.totalStaked} ETH</li>
                        <li>Outcomes: {selectedMarket.outcomes.join(', ')}</li>
                      </ul>
                    </div>
                  </div>
                );
              })()}
              <button 
                type="submit" 
                className={styles.button} 
                disabled={loading || !resolveMarketId || !resolveOutcome}
                style={{ marginTop: '1rem' }}
              >
                {loading ? 'Resolving...' : 'Resolve Market'}
              </button>
            </form>
          </div>

          {/* Markets List */}
          <div className={styles.marketsSection}>
            <h2 className={styles.sectionTitle}>Markets ({marketCount})</h2>
            {markets.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No markets created yet.</p>
              </div>
            ) : (
              <div className={styles.marketsGrid}>
                {markets.map((market) => {
                  const isExpired = new Date(market.deadline * 1000) < new Date();
                  const canBet = !market.resolved && !isExpired;
                  const yesStake = parseFloat(market.outcomeStakes[0] || '0');
                  const noStake = parseFloat(market.outcomeStakes[1] || '0');
                  const totalStake = parseFloat(market.totalStaked || '0');
                  const yesProbability = calculateProbability(yesStake, totalStake);
                  const noProbability = calculateProbability(noStake, totalStake);

                  return (
                    <div key={market.id} className={styles.marketCard}>
                      <div className={styles.marketHeader}>
                        <h3 className={styles.marketQuestion}>{market.question}</h3>
                        <div className={styles.marketMeta}>
                          <span className={styles.deadline}>Deadline: {formatDate(market.deadline)}</span>
                          {market.resolved && (
                            <span className={styles.resolvedBadge}>Resolved: {market.outcomes[market.winningOutcome]}</span>
                          )}
                          {isExpired && !market.resolved && (
                            <span className={styles.expiredBadge}>Expired</span>
                          )}
                        </div>
                      </div>

                      <div className={styles.votingSection}>
                        {/* Outcome Buttons - Show first 2 outcomes as Yes/No style */}
                        {market.outcomes.length >= 2 && (
                          <>
                            <button
                              className={`${styles.voteButton} ${styles.yesButton}`}
                              onClick={() => canBet && openBetModal(market.id, 0)}
                              disabled={!canBet || loading}
                            >
                              <div className={styles.voteButtonContent}>
                                <span className={styles.voteLabel}>{market.outcomes[0]}</span>
                                <div className={styles.probabilityDisplay}>
                                  <span className={styles.probabilityValue}>{yesProbability}%</span>
                                  <span className={styles.probabilityLabel}>chance</span>
                                </div>
                                <div className={styles.stakeAmount}>{yesStake.toFixed(4)} ETH</div>
                              </div>
                            </button>

                            <button
                              className={`${styles.voteButton} ${styles.noButton}`}
                              onClick={() => canBet && openBetModal(market.id, 1)}
                              disabled={!canBet || loading}
                            >
                              <div className={styles.voteButtonContent}>
                                <span className={styles.voteLabel}>{market.outcomes[1]}</span>
                                <div className={styles.probabilityDisplay}>
                                  <span className={styles.probabilityValue}>{noProbability}%</span>
                                  <span className={styles.probabilityLabel}>chance</span>
                                </div>
                                <div className={styles.stakeAmount}>{noStake.toFixed(4)} ETH</div>
                              </div>
                            </button>
                          </>
                        )}
                        {/* Fallback for markets with more than 2 outcomes */}
                        {market.outcomes.length > 2 && (
                          <div className={styles.additionalOutcomes}>
                            {market.outcomes.slice(2).map((outcome, idx) => {
                              const outcomeIndex = idx + 2;
                              const stake = parseFloat(market.outcomeStakes[outcomeIndex] || '0');
                              const probability = calculateProbability(stake, totalStake);
                              return (
                                <button
                                  key={outcomeIndex}
                                  className={`${styles.voteButton} ${styles.additionalButton}`}
                                  onClick={() => canBet && openBetModal(market.id, outcomeIndex)}
                                  disabled={!canBet || loading}
                                >
                                  <div className={styles.voteButtonContent}>
                                    <span className={styles.voteLabel}>{outcome}</span>
                                    <div className={styles.probabilityDisplay}>
                                      <span className={styles.probabilityValue}>{probability}%</span>
                                      <span className={styles.probabilityLabel}>chance</span>
                                    </div>
                                    <div className={styles.stakeAmount}>{stake.toFixed(4)} ETH</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {address && userStakes[market.id] && market.outcomes.map((outcome, idx) => 
                        parseFloat(userStakes[market.id][idx] || '0') > 0
                      ).some(Boolean) && (
                        <div className={styles.userStakes}>
                          <strong>Your stakes:</strong>{' '}
                          {market.outcomes.map((outcome, idx) => 
                            parseFloat(userStakes[market.id][idx] || '0') > 0 ? (
                              <span key={idx}>{outcome}: {userStakes[market.id][idx]} ETH </span>
                            ) : null
                          )}
                        </div>
                      )}

                      {/* Resolve button for market owner */}
                      {!market.resolved && 
                       address && 
                       market.owner.toLowerCase() === address.toLowerCase() &&
                       new Date(market.deadline * 1000) < new Date() && (
                        <button
                          onClick={() => {
                            setResolveMarketId(market.id.toString());
                            // Scroll to resolve section
                            document.getElementById('resolve-section')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className={styles.resolveButton}
                          disabled={loading}
                        >
                          Resolve This Market
                        </button>
                      )}

                      {market.resolved && address && userStakes[market.id] && 
                       parseFloat(userStakes[market.id][market.winningOutcome] || '0') > 0 && (
                        <button
                          onClick={() => claimWinnings(market.id)}
                          className={styles.claimButton}
                          disabled={loading}
                        >
                          Claim Winnings
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bet Modal */}
          {betModalOpen && selectedMarket && selectedOutcome !== null && (
            <div className={styles.modalOverlay} onClick={closeBetModal}>
              <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h2>Place Bet</h2>
                  <button className={styles.closeButton} onClick={closeBetModal}>×</button>
                </div>
                <div className={styles.modalBody}>
                  <p className={styles.modalQuestion}>{selectedMarket.question}</p>
                  <p className={styles.modalOutcome}>You're betting on: <strong>{selectedMarket.outcomes[selectedOutcome]}</strong></p>
                  <form onSubmit={placeBet}>
                    <label className={styles.label}>Amount (ETH)</label>
                    <input
                      type="number"
                      className={styles.input}
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      placeholder="0.1"
                      step="0.001"
                      min="0.001"
                      required
                    />
                    <div className={styles.modalActions}>
                      <button type="button" className={styles.cancelButton} onClick={closeBetModal}>
                        Cancel
                      </button>
                      <button type="submit" className={styles.submitButton} disabled={loading}>
                        {loading ? 'Placing Bet...' : 'Place Bet'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

