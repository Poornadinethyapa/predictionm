import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAccount, useProvider, useSigner } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract';
import styles from '../styles/Home.module.css';

export default function Home() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const provider = useProvider();
  const { data: signer } = useSigner();
  const [contract, setContract] = useState(null);
  const [marketCount, setMarketCount] = useState(0);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userStakes, setUserStakes] = useState({});
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'myBets', 'myMarkets'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'resolved', 'expired', 'myMarkets'
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'deadline', 'totalStaked', 'mostPopular'
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [pendingTx, setPendingTx] = useState(null);
  const [highlightedMarketId, setHighlightedMarketId] = useState(null);
  const [bookmarks, setBookmarks] = useState({});

  // Bet modal state
  const [betModalOpen, setBetModalOpen] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [betAmount, setBetAmount] = useState('');

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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const marketParam = params.get('market');
    if (!marketParam) return;
    const id = parseInt(marketParam, 10);
    if (Number.isNaN(id)) return;
    if (markets.some(m => m.id === id)) {
      setHighlightedMarketId(id);
      const el = document.getElementById(`market-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [markets]);

  // Update time remaining every minute
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      // Force re-render to update time remaining
      setMarkets(prev => [...prev]);
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [isConnected]);

  const showToast = (message, type = 'success', txHash = null) => {
    setToast({ message, type, txHash });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    const handleSearch = (event) => {
      setSearchQuery(event.detail || '');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('truecast_search', handleSearch);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('truecast_search', handleSearch);
      }
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('truecast_bookmarks');
      if (saved) setBookmarks(JSON.parse(saved));
    } catch {}
  }, []);

  const toggleBookmark = (id) => {
    setBookmarks(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem('truecast_bookmarks', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const formatVolume = (eth) => {
    const n = parseFloat(eth || '0');
    if (n >= 1000) return `${(n/1000).toFixed(1)}k ETH Vol.`;
    if (n >= 1) return `${n.toFixed(0)} ETH Vol.`;
    return `${n.toFixed(2)} ETH Vol.`;
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
      showToast('Please enter a valid bet amount', 'error');
      return;
    }
    setLoading(true);
    try {
      const amount = ethers.utils.parseEther(betAmount);
      const tx = await contract.placeBet(selectedMarket.id, selectedOutcome, { value: amount });
      setPendingTx(tx.hash);
      showToast('Transaction submitted...', 'info', tx.hash);
      
      await tx.wait();
      setPendingTx(null);
      
      closeBetModal();
      await loadMarkets();
      showToast('Bet placed successfully!', 'success', tx.hash);
    } catch (err) {
      console.error('Error placing bet:', err);
      setPendingTx(null);
      showToast('Error placing bet: ' + (err.message || err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const calculateProbability = (stake, totalStake) => {
    if (parseFloat(totalStake) === 0) return 50; // Default to 50% if no stakes
    return ((parseFloat(stake) / parseFloat(totalStake)) * 100).toFixed(1);
  };

  const claimWinnings = async (marketId) => {
    if (!contract || !signer) return;
    setLoading(true);
    try {
      const tx = await contract.claim(marketId);
      setPendingTx(tx.hash);
      showToast('Transaction submitted...', 'info', tx.hash);
      
      await tx.wait();
      setPendingTx(null);
      
      await loadMarkets();
      showToast('Winnings claimed successfully!', 'success', tx.hash);
    } catch (err) {
      console.error('Error claiming winnings:', err);
      setPendingTx(null);
      showToast('Error claiming winnings: ' + (err.message || err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const claimAllWinnings = async () => {
    if (!contract || !signer || !address) return;
    setLoading(true);
    try {
      const claimableMarkets = markets.filter(market => {
        if (!market.resolved) return false;
        if (!userStakes[market.id]) return false;
        const stake = parseFloat(userStakes[market.id][market.winningOutcome] || '0');
        return stake > 0;
      });

      if (claimableMarkets.length === 0) {
        showToast('No winnings to claim!', 'info');
        setLoading(false);
        return;
      }

      // Claim winnings for each market
      let successCount = 0;
      for (const market of claimableMarkets) {
        try {
          const tx = await contract.claim(market.id);
          setPendingTx(tx.hash);
          await tx.wait();
          successCount++;
        } catch (err) {
          console.error(`Error claiming market ${market.id}:`, err);
          // Continue with other markets even if one fails
        }
      }
      setPendingTx(null);

      await loadMarkets();
      showToast(`Successfully claimed winnings from ${successCount} market(s)!`, 'success');
    } catch (err) {
      console.error('Error claiming all winnings:', err);
      setPendingTx(null);
      showToast('Error claiming winnings: ' + (err.message || err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredMarkets = () => {
    let filtered = markets;

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(market => 
        market.question.toLowerCase().includes(query) ||
        market.outcomes.some(outcome => outcome.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    switch (statusFilter) {
      case 'active':
        filtered = filtered.filter(market => {
          const isExpired = new Date(market.deadline * 1000) < new Date();
          return !market.resolved && !isExpired;
        });
        break;
      case 'resolved':
        filtered = filtered.filter(market => market.resolved);
        break;
      case 'expired':
        filtered = filtered.filter(market => {
          const isExpired = new Date(market.deadline * 1000) < new Date();
          return !market.resolved && isExpired;
        });
        break;
      case 'myMarkets':
        if (address) {
          filtered = filtered.filter(market => 
            market.owner.toLowerCase() === address.toLowerCase()
          );
        }
        break;
      default:
        // 'all' - no status filter
        break;
    }

    // Apply user filter (My Bets)
    if (activeFilter === 'myBets' && address) {
      filtered = filtered.filter(market => {
        if (!userStakes[market.id]) return false;
        return market.outcomes.some((_, idx) => 
          parseFloat(userStakes[market.id][idx] || '0') > 0
        );
      });
    }

    // Apply sorting
    switch (sortBy) {
      case 'newest':
        filtered = [...filtered].sort((a, b) => b.id - a.id);
        break;
      case 'deadline':
        filtered = [...filtered].sort((a, b) => a.deadline - b.deadline);
        break;
      case 'totalStaked':
        filtered = [...filtered].sort((a, b) => 
          parseFloat(b.totalStaked || '0') - parseFloat(a.totalStaked || '0')
        );
        break;
      case 'mostPopular':
        // Sort by number of unique bettors (approximated by total outcomes with stakes)
        filtered = [...filtered].sort((a, b) => {
          const aBettors = a.outcomeStakes.filter(s => parseFloat(s || '0') > 0).length;
          const bBettors = b.outcomeStakes.filter(s => parseFloat(s || '0') > 0).length;
          return bBettors - aBettors;
        });
        break;
      default:
        break;
    }

    return filtered;
  };

  const getClaimableCount = () => {
    if (!address) return 0;
    return markets.filter(market => {
      if (!market.resolved) return false;
      if (!userStakes[market.id]) return false;
      const stake = parseFloat(userStakes[market.id][market.winningOutcome] || '0');
      return stake > 0;
    }).length;
  };

  const getUserStats = () => {
    if (!address) return null;

    // Markets created
    const marketsCreated = markets.filter(m => 
      m.owner.toLowerCase() === address.toLowerCase()
    ).length;

    // Markets where user has bets
    const marketsWithBets = markets.filter(m => {
      if (!userStakes[m.id]) return false;
      return m.outcomes.some((_, idx) => 
        parseFloat(userStakes[m.id][idx] || '0') > 0
      );
    });

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
          // Calculate potential earnings (stake + proportional share of loser pool)
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

  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', { 
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) + ' UTC';
  };

  const getTimeRemaining = (deadline) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = deadline - now;
    
    if (remaining <= 0) return null;
    
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getMarketStatus = (market) => {
    if (market.resolved) return 'resolved';
    const isExpired = new Date(market.deadline * 1000) < new Date();
    if (isExpired) return 'expired';
    return 'active';
  };

  const getNumberOfBets = (market) => {
    // Count outcomes with stakes > 0 as an approximation of number of bets
    return market.outcomeStakes.filter(s => parseFloat(s || '0') > 0).length;
  };

  const shareMarket = (marketId) => {
    const url = `${window.location.origin}${window.location.pathname}?market=${marketId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Market link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy link', 'error');
    });
  };

  const getBlockExplorerUrl = (txHash) => {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.filterTabs}>
        <button
          className={`${styles.filterTab} ${statusFilter === 'all' && activeFilter === 'all' ? styles.activeTab : ''}`}
          onClick={() => {
            setStatusFilter('all');
            setActiveFilter('all');
            document.getElementById('markets-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          Markets
        </button>
        <button
          className={`${styles.filterTab} ${activeFilter === 'myBets' ? styles.activeTab : ''}`}
          onClick={() => {
            setActiveFilter(activeFilter === 'myBets' ? 'all' : 'myBets');
            setStatusFilter('all');
            document.getElementById('markets-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          My Bets
        </button>
        <button
          className={`${styles.filterTab} ${statusFilter === 'myMarkets' ? styles.activeTab : ''}`}
          onClick={() => {
            setStatusFilter('myMarkets');
            setActiveFilter('all');
            document.getElementById('markets-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          My Markets
        </button>
        <button
          className={`${styles.filterTab} ${statusFilter === 'resolved' ? styles.activeTab : ''}`}
          onClick={() => {
            setStatusFilter('resolved');
            setActiveFilter('all');
            document.getElementById('markets-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          Resolved
        </button>
        <button
          className={`${styles.filterTab} ${statusFilter === 'expired' ? styles.activeTab : ''}`}
          onClick={() => {
            setStatusFilter('expired');
            setActiveFilter('all');
            document.getElementById('markets-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          Expired
        </button>
        <button
          className={styles.filterTab}
          onClick={() => {
            if (!isConnected) {
              showToast('Connect wallet to resolve markets', 'error');
              return;
            }
            router.push('/resolve');
          }}
        >
          Resolve
        </button>
        <button
          className={styles.filterTab}
          onClick={() => {
            if (!isConnected) {
              showToast('Connect wallet to view stats', 'info');
              return;
            }
            document.getElementById('stats-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          Stats
        </button>
      </div>

      {!isConnected && (
        <div className={styles.landingPage}>
          {/* Hero Section */}
          <section className={styles.hero}>
            <h1 className={styles.heroTitle}>Truecast</h1>
            <p className={styles.heroSubtitle}>
              A decentralized prediction market platform built on Base Sepolia
            </p>
            <p className={styles.heroDescription}>
              Create markets, place bets, and win rewards based on real-world outcomes. 
              Powered by smart contracts for transparent and trustless predictions.
            </p>
            <div className={styles.ctaSection}>
              <div className={styles.ctaHighlight}>
                <ConnectButton />
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className={styles.features}>
            <h2 className={styles.featuresTitle}>Features</h2>
            <div className={styles.featuresGrid}>
              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>📊</div>
                <h3 className={styles.featureTitle}>Create Markets</h3>
                <p className={styles.featureDescription}>
                  Create prediction markets on any topic. Set questions, outcomes, and deadlines.
                </p>
              </div>
              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>💰</div>
                <h3 className={styles.featureTitle}>Place Bets</h3>
                <p className={styles.featureDescription}>
                  Bet ETH on outcomes you believe will happen. See real-time probability updates.
                </p>
              </div>
              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>🏆</div>
                <h3 className={styles.featureTitle}>Win Rewards</h3>
                <p className={styles.featureDescription}>
                  Winners receive proportional payouts based on their stake and the total pool.
                </p>
              </div>
              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>🔒</div>
                <h3 className={styles.featureTitle}>Decentralized</h3>
                <p className={styles.featureDescription}>
                  Built on blockchain for transparency, security, and trustless execution.
                </p>
              </div>
            </div>
          </section>

          {/* How It Works Section */}
          <section className={styles.howItWorks}>
            <h2 className={styles.sectionTitle}>How It Works</h2>
            <div className={styles.steps}>
              <div className={styles.step}>
                <div className={styles.stepNumber}>1</div>
                <h3 className={styles.stepTitle}>Connect Wallet</h3>
                <p className={styles.stepDescription}>
                  Connect your MetaMask or other Web3 wallet to get started
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>2</div>
                <h3 className={styles.stepTitle}>Create or Browse Markets</h3>
                <p className={styles.stepDescription}>
                  Create your own prediction market or browse existing markets
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>3</div>
                <h3 className={styles.stepTitle}>Place Your Bet</h3>
                <p className={styles.stepDescription}>
                  Choose an outcome and bet ETH. Watch probabilities update in real-time
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>4</div>
                <h3 className={styles.stepTitle}>Claim Winnings</h3>
                <p className={styles.stepDescription}>
                  After market resolution, winners can claim their proportional rewards
                </p>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className={styles.finalCta}>
            <h2 className={styles.ctaTitle}>Ready to Start Predicting?</h2>
            <p className={styles.ctaDescription}>
              Connect your wallet and join the prediction market revolution
            </p>
            <div className={styles.ctaButtonWrapper}>
              <ConnectButton />
            </div>
          </section>
        </div>
      )}

      {isConnected && (
        <>
          {/* User Profile Stats */}
          {getUserStats() && (
            <div id="stats-section" className={styles.userStatsSection}>
              <h2 className={styles.statsTitle}>Your Stats</h2>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>📊</div>
                  <div className={styles.statValue}>{getUserStats().winRate}%</div>
                  <div className={styles.statLabel}>Win Rate</div>
                  <div className={styles.statSubtext}>
                    {getUserStats().totalResolvedBets} resolved bet{getUserStats().totalResolvedBets !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>💰</div>
                  <div className={styles.statValue}>{getUserStats().totalEarnings}</div>
                  <div className={styles.statLabel}>Total Earnings (ETH)</div>
                  <div className={styles.statSubtext}>From winning bets</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>📝</div>
                  <div className={styles.statValue}>{getUserStats().marketsCreated}</div>
                  <div className={styles.statLabel}>Markets Created</div>
                  <div className={styles.statSubtext}>Your prediction markets</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>🏆</div>
                  <div className={styles.statValue}>{getUserStats().marketsWon}</div>
                  <div className={styles.statLabel}>Markets Won</div>
                  <div className={styles.statSubtext}>Successful predictions</div>
                </div>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className={styles.searchFiltersSection}>
            <div className={styles.searchBar}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search markets by question..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className={styles.filtersRow}>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Filter:</label>
                <select
                  className={styles.filterSelect}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Markets</option>
                  <option value="active">Active</option>
                  <option value="resolved">Resolved</option>
                  <option value="expired">Expired</option>
                  {address && <option value="myMarkets">My Markets</option>}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Sort by:</label>
                <select
                  className={styles.filterSelect}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="newest">Newest</option>
                  <option value="deadline">Deadline</option>
                  <option value="totalStaked">Total Staked</option>
                  <option value="mostPopular">Most Popular</option>
                </select>
              </div>

              <div className={styles.filterGroup}>
                <button
                  className={`${styles.filterTab} ${activeFilter === 'myBets' ? styles.activeTab : ''}`}
                  onClick={() => setActiveFilter(activeFilter === 'myBets' ? 'all' : 'myBets')}
                >
                  My Bets ({markets.filter(m => {
                    if (!userStakes[m.id]) return false;
                    return m.outcomes.some((_, idx) => 
                      parseFloat(userStakes[m.id][idx] || '0') > 0
                    );
                  }).length})
                </button>
              </div>

              {getClaimableCount() > 0 && (
                <button
                  className={styles.claimAllButton}
                  onClick={claimAllWinnings}
                  disabled={loading}
                >
                  Claim All ({getClaimableCount()})
                </button>
              )}
            </div>
          </div>

          {/* Markets List */}
          <div id="markets-section" className={styles.marketsSection}>
            <h2 className={styles.sectionTitle}>
              {getFilteredMarkets().length} {getFilteredMarkets().length === 1 ? 'Market' : 'Markets'}
              {searchQuery && ` matching "${searchQuery}"`}
            </h2>
            {getFilteredMarkets().length === 0 ? (
              <div className={styles.emptyState}>
                <p>
                  {searchQuery ? `No markets found matching "${searchQuery}"` : 'No markets found with the selected filters.'}
                </p>
              </div>
            ) : (
              <div className={styles.marketsGrid}>
                {getFilteredMarkets().map((market) => {
                  const isExpired = new Date(market.deadline * 1000) < new Date();
                  const canBet = !market.resolved && !isExpired;
                  const yesStake = parseFloat(market.outcomeStakes[0] || '0');
                  const noStake = parseFloat(market.outcomeStakes[1] || '0');
                  const totalStake = parseFloat(market.totalStaked || '0');
                  const yesProbability = calculateProbability(yesStake, totalStake);
                  const noProbability = calculateProbability(noStake, totalStake);
                  const probs = market.outcomes.map((_, idx) => calculateProbability(parseFloat(market.outcomeStakes[idx] || '0'), totalStake));
                  const topIdx = probs.reduce((maxI, p, i) => parseFloat(p) > parseFloat(probs[maxI]) ? i : maxI, 0);
                  const topProb = probs[topIdx];
                  const titleInitial = market.question?.trim()?.charAt(0)?.toUpperCase() || '#';

                  return (
                    <div key={market.id} id={`market-${market.id}`} className={`${styles.marketCardCompact} ${highlightedMarketId === market.id ? styles.highlightedMarketCard : ''}`}>
                      <div className={styles.marketCardHeaderCompact}>
                        <div className={styles.marketThumb}>{titleInitial}</div>
                        <div className={styles.marketHeaderText}>
                          <h3 className={styles.marketQuestionCompact}>{market.question}</h3>
                          <div className={styles.marketMetaCompact}>
                            <span className={styles.marketDeadline}>{formatDate(market.deadline)}</span>
                          </div>
                        </div>
                      </div>

                      {market.outcomes.length === 2 && (
                        <div className={styles.outcomesRowCompact}>
                          <button
                            className={`${styles.miniOutcome} ${styles.miniYes}`}
                            onClick={() => canBet && openBetModal(market.id, 0)}
                            disabled={!canBet || loading}
                          >
                            <span>{market.outcomes[0]}</span>
                            <span className={styles.miniOutcomeValue}>{yesProbability}%</span>
                          </button>
                          <button
                            className={`${styles.miniOutcome} ${styles.miniNo}`}
                            onClick={() => canBet && openBetModal(market.id, 1)}
                            disabled={!canBet || loading}
                          >
                            <span>{market.outcomes[1]}</span>
                            <span className={styles.miniOutcomeValue}>{noProbability}%</span>
                          </button>
                        </div>
                      )}

                      {market.outcomes.length > 2 && (
                        <div className={styles.outcomesColumnCompact}>
                          {market.outcomes.map((outcome, idx) => {
                            const stake = parseFloat(market.outcomeStakes[idx] || '0');
                            const probability = calculateProbability(stake, totalStake);
                            return (
                              <button
                                key={idx}
                                className={`${styles.miniOutcome} ${styles.miniNeutral}`}
                                onClick={() => canBet && openBetModal(market.id, idx)}
                                disabled={!canBet || loading}
                              >
                                <span>{outcome}</span>
                                <span className={styles.miniOutcomeValue}>{probability}%</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className={styles.marketFooterCompact}>
                        <span className={styles.marketVolume}>{formatVolume(market.totalStaked)}</span>
                        <div className={styles.marketActionsCompact}>
                          <button className={styles.iconButton} onClick={() => shareMarket(market.id)} title="Share">🔗</button>
                          <button className={`${styles.iconButton} ${bookmarks[market.id] ? styles.iconActive : ''}`} onClick={() => toggleBookmark(market.id)} title="Bookmark">🔖</button>
                        </div>
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

      {/* Toast Notification */}
      {toast && (
        <div className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}>
          <div className={styles.toastContent}>
            <span>{toast.message}</span>
            {toast.txHash && (
              <a
                href={getBlockExplorerUrl(toast.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.txLink}
                onClick={(e) => e.stopPropagation()}
              >
                View on Basescan ↗
              </a>
            )}
          </div>
          <button className={styles.toastClose} onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && pendingTx && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <div className={styles.spinner}></div>
            <p>Transaction pending...</p>
            <a
              href={getBlockExplorerUrl(pendingTx)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.txLink}
            >
              View on Basescan ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

