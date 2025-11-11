# Truecast on Base

This repository is a ready-to-deploy template for a simple prediction market. It contains a Solidity contract and a Next.js frontend. The contract supports multiple outcomes, market creation, betting with ETH, resolution by market owner, and proportional payout to winners.

## Project structure

```
predict-and-win/
├─ contracts/
│  └─ PredictionMarket.sol
├─ pages/
│  ├─ _app.js
│  └─ index.js
├─ lib/
│  └─ contract.js
├─ styles/
│  ├─ globals.css
│  └─ Home.module.css
├─ package.json
├─ README.md
```

## Quick Deploy Steps

### 1. Compile & deploy the contract

- Open `contracts/PredictionMarket.sol` in Remix (https://remix.ethereum.org)
- Use the Solidity compiler 0.8.17 or compatible
- Deploy to Base Sepolia testnet (select injected provider and your MetaMask connected to Base Sepolia)
- Copy the deployed contract address

### 2. Update frontend

- Open `lib/contract.js` and paste the contract address and ABI
- Configure RPC provider (Alchemy/Infura/Provider URL) in `_app.js` or in a small provider wrapper
- For Base Sepolia, replace `chain.mainnet` with `chain.baseSepolia` in `pages/_app.js`:
  ```javascript
  import { baseSepolia } from 'wagmi/chains';
  const { chains, provider } = configureChains([baseSepolia], [publicProvider()]);
  ```

### 3. Run locally

- `npm install`
- `npm run dev`
- Test the flows in your browser (connect wallet, create a market, bet, resolve, claim)

### 4. Deploy frontend to Vercel (free)

- Push the repo to GitHub
- Log in to Vercel and import the GitHub repo
- Set env vars if needed (RPC URL) via Vercel dashboard
- Deploy

## Features

- **Create Markets**: Market creators can set a question, multiple outcomes, and a deadline
- **Place Bets**: Users can bet ETH on any outcome before the deadline
- **Resolve Markets**: Market owners can resolve markets after the deadline by setting the winning outcome
- **Claim Winnings**: Winners can claim proportional payouts based on their stake relative to the total winning stake

## Contract Details

- The contract stores per-market mappings inside the Market struct; this is simple and gas-efficient for small markets.
- The owner of a market is the creator (no separate admin required).
- Resolution is manual (owner calls `resolveMarket`). You can extend this to use an oracle (e.g., Chainlink) later.

## Notes & Next Steps

- This template keeps gas usage modest but is not production hardened. Consider adding:
  - Oracle-based resolution (Chainlink, or a decentralized oracle)
  - Market fees (platform fee or creator fee)
  - Front-running and manipulation mitigations
  - Frontend UX polish
  - Unit tests (Hardhat)

- All tools suggested are free on their basic tiers. For Base mainnet or real funds you will need real ETH and careful auditing.

## License

MIT

