const { Token } = require('@uniswap/sdk-core');
const { FeeAmount } = require('@uniswap/v3-sdk');

const { USDC_TOKEN, WETH_TOKEN } = require('./constants');

// Environment represented as an object since JavaScript doesn't have enums
const Environment = {
  LOCAL: 0,
  MAINNET: 1,
  WALLET_EXTENSION: 2,
};

// Directly using the object structure for configuration, as JavaScript doesn't support interfaces
const CurrentConfig = {
  env: Environment.LOCAL, // Assigning directly from the Environment object
  rpc: {
    mainnet: 'https://eth-mainnet.g.alchemy.com/v2/uQMzFFe-s-LHk8kRSgBJ4-FCbr7o7DNm',
  },
  wallet: {
    address: '',
    privateKey: '',
  },
  tokens: {
    in: WETH_TOKEN,
    amountIn: 1,
    out: USDC_TOKEN,
    poolFee: FeeAmount.MEDIUM, // Assuming FeeAmount is an object or constant that has been properly defined/imported
  },
};

module.exports = { CurrentConfig, Environment };
