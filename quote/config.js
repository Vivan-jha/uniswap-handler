const { Token } = require('@uniswap/sdk-core');
const { FeeAmount } = require('@uniswap/v3-sdk');
const { USDC_TOKEN, WETH_TOKEN } = require('./constants');

// Example Configuration

const CurrentConfig = {
  rpc: {
    local: 'http://localhost:8545',
    mainnet: 'https://eth.llamarpc.com',
  },
  tokens: {
    in: USDC_TOKEN,
    amountIn: 1000,
    out: WETH_TOKEN,
    poolFee: FeeAmount.MEDIUM,
  },
};

module.exports = { CurrentConfig };
