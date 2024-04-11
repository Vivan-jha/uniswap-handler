const { ethers } = require('ethers');
const { CurrentConfig } = require('./config');

// Provider Functions

function getProvider() {
  return new ethers.providers.JsonRpcProvider(CurrentConfig.rpc.mainnet);
}

module.exports = { getProvider };
