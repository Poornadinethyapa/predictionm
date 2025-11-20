import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAccount, useProvider, useSigner } from 'wagmi';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract';
import styles from '../styles/Stats.module.css';

export default function StatsPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const provider = useProvider();
  const { data: signer } = useSigner();

  const [contract, setContract] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [userStakes, setUserStakes] = useState({});
  const [loading, setLoading] = useState(false);

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

  const getUserStats = () => {
    if (!address) return null;

    // Markets created
    const marketsCreated = markets.filter(m => 
      m.owner.toLowerCase() === address.toLowerCase()
    ).length;

    // Markets won (resolved markets where user bet on winning outcome)
    const marketsWon = markets.filter(m => {
      if (!m.resolved) return false;
      if (!userStakes[m.id]) return false;
      const stake = parseFloat(userStakes[m.id][m.winningOutcome] || '0');
      return stake > 0;
    }).length;

    // Markets lost (resolved markets where user bet on losing outcome)
    const marketsLost = markets.filter(m => {
      if (!m.resolved) return false;
      if (!userStakes[m.id]) return false;
      const winningStake = parseFloat(userStakes[m.id][m.winningOutcome] || '0');
      const hasLosingStake = m.outcomes.some((_, idx) => {
        if (idx === m.winningOutcome) return false;
        return parseFloat(userStakes[m.id][idx] || '0') > 0;
      });
      return winningStake === 0 && hasLosingStake;
    }).length;

    // Calculate win rate
    const totalResolvedBets = marketsWon + marketsLost;
    const winRate = totalResolvedBets > 0 
      ? ((marketsWon / totalResolvedBets) * 100).toFixed(1)
      : '0.0';

    // Calculate total earnings (sum of all winning stakes)
    let totalEarnings = 0;
    markets.forEach(m => {
      if (m.resolved && userStakes[m.id]) {
        const stake = parseFloat(userStakes[m.id][m.winningOutcome] || '0');
        if (stake > 0) {
          const totalWinningStake = parseFloat(m.outcomeStakes[m.winningOutcome] || '0');
          const totalStake = parseFloat(m.totalStaked || '0');
          const loserPool = totalStake - totalWinningStake;
          const payout = stake + (loserPool * stake) / totalWinningStake;
          totalEarnings += payout;
        }
      }
    });

    return {
      winRate,
      totalEarnings: totalEarnings.toFixed(4),
      marketsCreated,
      marketsWon,
      totalResolvedBets
    };
  };

  const stats = getUserStats();

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>Your Stats</h1>
          <button className={styles.backButton} onClick={() => router.push('/')}>
            ← Back to Markets
          </button>
        </div>

        {!isConnected && (
          <div className={`${styles.alert} ${styles.error}`}>
            Connect your wallet to view your stats.
          </div>
        )}

        {isConnected && stats && (
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>📊</div>
              <div className={styles.statValue}>{stats.winRate}%</div>
              <div className={styles.statLabel}>Win Rate</div>
              <div className={styles.statSubtext}>
                {stats.totalResolvedBets} resolved bet{stats.totalResolvedBets !== 1 ? 's' : ''}
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>💰</div>
              <div className={styles.statValue}>{stats.totalEarnings}</div>
              <div className={styles.statLabel}>Total Earnings (ETH)</div>
              <div className={styles.statSubtext}>From winning bets</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>📝</div>
              <div className={styles.statValue}>{stats.marketsCreated}</div>
              <div className={styles.statLabel}>Markets Created</div>
              <div className={styles.statSubtext}>Your prediction markets</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>🏆</div>
              <div className={styles.statValue}>{stats.marketsWon}</div>
              <div className={styles.statLabel}>Markets Won</div>
              <div className={styles.statSubtext}>Successful predictions</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
