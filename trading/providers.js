const { ethers } = require('ethers');
const { CurrentConfig, Environment } = require('./config');

// Single copies of provider and wallet
console.log("RPC URL:", CurrentConfig.rpc.mainnet);
const mainnetProvider= new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545/", {
  name: "mainnet",
  chainId: 1,
});

console.log("Provider initialized:", mainnetProvider);
const wallet = createWallet();

// Example static call to fetch the current block number
mainnetProvider.getBlockNumber().then((blockNumber) => console.log("Current Block Number:", blockNumber)).catch((error) => console.error(error));


const browserExtensionProvider = createBrowserExtensionProvider();
let walletExtensionAddress = null;

// TransactionState represented as an object
const TransactionState = {
  Failed: 'Failed',
  New: 'New',
  Rejected: 'Rejected',
  Sending: 'Sending',
  Sent: 'Sent',
};

// Provider and Wallet Functions
// In providers.js, when you create mainnetProvider



function getMainnetProvider() {
  return mainnetProvider;
}

// function getProvider() {
//   return CurrentConfig.env === Environment.WALLET_EXTENSION ? browserExtensionProvider : wallet.provider;
// }

function getProvider() {
return mainnetProvider; 
}


function getWalletAddress() {
  return CurrentConfig.env === Environment.WALLET_EXTENSION ? walletExtensionAddress : wallet.address;
}

async function sendTransaction(transaction) {
  // if (CurrentConfig.env === Environment.WALLET_EXTENSION) {
  //   return sendTransactionViaExtension(transaction);
  // } else {
  //   if (transaction.value) {
  //     transaction.value = ethers.BigNumber.from(transaction.value);
  //   }
  //   return sendTransactionViaWallet(transaction);
  // }
  return sendTransactionViaWallet(transaction);
}

async function connectBrowserExtensionWallet() {
  if (typeof window !== 'undefined' && window.ethereum) {
    const ethereum = window.ethereum;
    const provider = new ethers.providers.Web3Provider(ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
  
    if (accounts.length !== 1) {
      return null;
    }
  
    walletExtensionAddress = accounts[0];
    return walletExtensionAddress;
  } else {
    console.log('No Wallet Extension Found');
    return null;
  }
}


function createWallet() {
  let provider = mainnetProvider;
  // if (CurrentConfig.env === Environment.LOCAL) {
  //   provider = new ethers.providers.JsonRpcProvider(CurrentConfig.rpc.local);
  // }
  return new ethers.Wallet(CurrentConfig.wallet.privateKey, provider);
}

function createBrowserExtensionProvider() {
  if (typeof window !== 'undefined' && window.ethereum) {
    return new ethers.providers.Web3Provider(window.ethereum, 'any');
  } else {
    console.log('Running in Node.js environment, using mainnetProvider instead.');
    return null; 
  }
}


async function sendTransactionViaExtension(transaction) {
  try {
    const receipt = await (browserExtensionProvider ? browserExtensionProvider.send('eth_sendTransaction', [transaction]) : Promise.reject('No browser extension provider'));
    return receipt ? TransactionState.Sent : TransactionState.Failed;
  } catch (e) {
    console.log(e);
    return TransactionState.Rejected;
  }
}

async function sendTransactionViaWallet(transaction) {
  console.log("transaction",transaction);
  if (transaction.value) {
    transaction.value = ethers.BigNumber.from(transaction.value);
  }
  // const estimatedGasLimit = await wallet.estimateGas(transaction);
  // console.log("Estimated Gas Limit:", estimatedGasLimit.toString());

  transaction.gasLimit = 3000000;

  const txRes = await wallet.sendTransaction(transaction);
  console.log("txres",txRes);
  
  let receipt = null;
  const provider = getProvider();
  if (!provider) {
    return TransactionState.Failed;
  }
  
  while (receipt === null) {
    try {
      receipt = await provider.getTransactionReceipt(txRes.hash);
      if (receipt === null) {
        continue;
      }
    } catch (e) {
      console.log(`Receipt error:`, e);
      break;
    }
  }
  console.log("receipt",receipt);
  
  return receipt ? TransactionState.Sent : TransactionState.Failed;
}

module.exports = {
  getMainnetProvider,
  getProvider,
  getWalletAddress,
  sendTransaction,
  connectBrowserExtensionWallet,
  TransactionState
};
