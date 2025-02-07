const { Token } = require('@uniswap/sdk-core');

// Addresses

const POOL_FACTORY_CONTRACT_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const QUOTER_CONTRACT_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

// SupportedChainId is not explicitly available in JavaScript as it is a TypeScript enum,
// so we'll use the actual values directly.
const SupportedChainId = {
  MAINNET: 1 // Using the actual value for the Ethereum Mainnet
};

// Currencies and Tokens

const WETH_TOKEN = new Token(
  SupportedChainId.MAINNET,
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  18,
  'WETH',
  'Wrapped Ether'
);

const USDC_TOKEN = new Token(
  SupportedChainId.MAINNET,
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  6,
  'USDC',
  'USD Coin'
);

module.exports = {
  POOL_FACTORY_CONTRACT_ADDRESS,
  QUOTER_CONTRACT_ADDRESS,
  WETH_TOKEN,
  USDC_TOKEN
};
