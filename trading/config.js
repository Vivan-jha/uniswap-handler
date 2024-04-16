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
    mainnet: 'http://127.0.0.1:8545/',
  },
  wallet: {
    address: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
    privateKey: '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e',
  },
  tokens: {
    in: WETH_TOKEN,
    amountIn: 1,
    out: USDC_TOKEN,
    poolFee: FeeAmount.MEDIUM, // Assuming FeeAmount is an object or constant that has been properly defined/imported
  },
};

module.exports = { CurrentConfig, Environment };
