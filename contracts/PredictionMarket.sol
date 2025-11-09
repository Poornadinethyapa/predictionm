// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract PredictionMarket {
    uint public marketCount;

    struct Market {
        address owner;
        string question;
        string[] outcomes;
        uint deadline; // unix timestamp
        bool resolved;
        uint winningOutcome; // index
        uint totalStaked; // total ETH staked
        mapping(uint => uint) outcomeStaked; // outcome index => amount
        mapping(address => mapping(uint => uint)) bets; // user => outcome => amount
    }

    mapping(uint => Market) private markets;

    event MarketCreated(uint indexed marketId, address indexed owner, string question, string[] outcomes, uint deadline);
    event BetPlaced(uint indexed marketId, address indexed bettor, uint indexed outcome, uint amount);
    event MarketResolved(uint indexed marketId, uint winningOutcome);
    event PayoutClaimed(uint indexed marketId, address indexed claimer, uint amount);

    modifier onlyOwner(uint marketId) {
        require(markets[marketId].owner == msg.sender, "only market owner");
        _;
    }

    modifier beforeDeadline(uint marketId) {
        require(block.timestamp < markets[marketId].deadline, "deadline passed");
        _;
    }

    modifier afterDeadline(uint marketId) {
        require(block.timestamp >= markets[marketId].deadline, "deadline not reached");
        _;
    }

    function createMarket(string memory _question, string[] memory _outcomes, uint _deadline) external returns (uint) {
        require(_outcomes.length >= 2, "need at least two outcomes");
        require(_deadline > block.timestamp + 60, "deadline too soon");

        uint id = marketCount++;
        Market storage m = markets[id];
        m.owner = msg.sender;
        m.question = _question;
        m.deadline = _deadline;
        for (uint i = 0; i < _outcomes.length; i++) {
            m.outcomes.push(_outcomes[i]);
        }

        emit MarketCreated(id, msg.sender, _question, m.outcomes, _deadline);
        return id;
    }

    function getMarketBasic(uint marketId) external view returns (
        address owner,
        string memory question,
        uint deadline,
        bool resolved,
        uint winningOutcome,
        uint totalStaked,
        uint[] memory outcomeStakes,
        string[] memory outcomes
    ) {
        Market storage m = markets[marketId];
        owner = m.owner;
        question = m.question;
        deadline = m.deadline;
        resolved = m.resolved;
        winningOutcome = m.winningOutcome;
        totalStaked = m.totalStaked;

        uint n = m.outcomes.length;
        outcomeStakes = new uint[](n);
        for (uint i = 0; i < n; i++) outcomeStakes[i] = m.outcomeStaked[i];

        outcomes = new string[](n);
        for (uint i = 0; i < n; i++) outcomes[i] = m.outcomes[i];
    }

    function placeBet(uint marketId, uint outcome) external payable beforeDeadline(marketId) {
        require(msg.value > 0, "stake must be > 0");
        Market storage m = markets[marketId];
        require(outcome < m.outcomes.length, "invalid outcome");

        m.bets[msg.sender][outcome] += msg.value;
        m.outcomeStaked[outcome] += msg.value;
        m.totalStaked += msg.value;

        emit BetPlaced(marketId, msg.sender, outcome, msg.value);
    }

    // Owner resolves market by providing the winning outcome index after deadline
    function resolveMarket(uint marketId, uint winningOutcome) external afterDeadline(marketId) onlyOwner(marketId) {
        Market storage m = markets[marketId];
        require(!m.resolved, "already resolved");
        require(winningOutcome < m.outcomes.length, "invalid outcome");

        m.resolved = true;
        m.winningOutcome = winningOutcome;

        emit MarketResolved(marketId, winningOutcome);
    }

    // Claim winnings for a specific market. Winners get (their stake / totalWinningStake) * totalLoserPool
    function claim(uint marketId) external {
        Market storage m = markets[marketId];
        require(m.resolved, "not resolved");

        uint userStake = m.bets[msg.sender][m.winningOutcome];
        require(userStake > 0, "no winning stake");

        uint totalWinningStake = m.outcomeStaked[m.winningOutcome];
        uint loserPool = m.totalStaked - totalWinningStake;
        uint payout = userStake + (loserPool * userStake) / totalWinningStake;

        // zero out bet to prevent re-entrancy/duplicate claims
        m.bets[msg.sender][m.winningOutcome] = 0;

        (bool sent,) = msg.sender.call{value: payout}('');
        require(sent, "transfer failed");

        emit PayoutClaimed(marketId, msg.sender, payout);
    }

    // Helper to view user stake
    function userStakeIn(uint marketId, address user, uint outcome) external view returns (uint) {
        return markets[marketId].bets[user][outcome];
    }
}

