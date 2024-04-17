const { ethers } = require('ethers');
const JSBI = require('jsbi');
const { CurrentConfig } = require('./config');
const {
  ERC20_ABI,
  QUOTER_CONTRACT_ADDRESS,
  SWAP_ROUTER_ADDRESS,
  TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER,
  MAX_FEE_PER_GAS,
  MAX_PRIORITY_FEE_PER_GAS
} = require('./constants');
const { getPoolInfo} = require('./pool');
const {
  getProvider,
  getWalletAddress,
  sendTransaction,
  TransactionState,
} = require('./providers');
const { fromReadableAmount } = require('./utils');
const { Pool, Route, SwapQuoter, SwapRouter, Trade } = require('@uniswap/v3-sdk');
const { Currency,
  CurrencyAmount,
  Percent,
  Token,
  TradeType, } = require('@uniswap/sdk-core');
const BigNumber = require('big-number/big-number');


// Trading Functions

async function createTrade() {
  const poolInfo = await getPoolInfo();

  const pool = new Pool(
    CurrentConfig.tokens.in,
    CurrentConfig.tokens.out,
    CurrentConfig.tokens.poolFee,
    poolInfo.sqrtPriceX96.toString(),
    poolInfo.liquidity.toString(),
    poolInfo.tick
  );

  const swapRoute = new Route(
    [pool],
    CurrentConfig.tokens.in,
    CurrentConfig.tokens.out
  );

  const amountOut = await getOutputQuote(swapRoute);

  const uncheckedTrade = Trade.createUncheckedTrade({
    route: swapRoute,
    inputAmount: CurrencyAmount.fromRawAmount(
      CurrentConfig.tokens.in,
      fromReadableAmount(
        CurrentConfig.tokens.amountIn,
        CurrentConfig.tokens.in.decimals
      ).toString()
    ),
    outputAmount: CurrencyAmount.fromRawAmount(
      CurrentConfig.tokens.out,
      JSBI.BigInt(amountOut)
    ),
    tradeType: TradeType.EXACT_INPUT,
  });

  return uncheckedTrade;
}

async function executeTrade(trade) {
  const walletAddress = getWalletAddress();
  const provider = getProvider();

  if (!walletAddress || !provider) {
    throw new Error('Cannot execute a trade without a connected wallet');
  }

  const tokenApproval = await getTokenTransferApproval(CurrentConfig.tokens.in);

  if (tokenApproval !== TransactionState.Sent) {
    return TransactionState.Failed;
  }
  console.log("token transfer approval",tokenApproval);
  const options = {
    slippageTolerance: new Percent(50, 10_000),
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    recipient: walletAddress,
  };

  const methodParameters = SwapRouter.swapCallParameters([trade], options);
  console.log("method para",methodParameters);

  const tx = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_ADDRESS,
    value: ethers.utils.parseUnits('1', 18),
    from: walletAddress,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  };

  const res = await sendTransaction(tx);

  return res;
}

// Helper Quoting and Pool Functions

async function getOutputQuote(route) {
  const provider = getProvider();

  if (!provider) {
    throw new Error('Provider required to get pool state');
  }

  const { calldata } = await SwapQuoter.quoteCallParameters(
    route,
    CurrencyAmount.fromRawAmount(
      CurrentConfig.tokens.in,
      fromReadableAmount(
        CurrentConfig.tokens.amountIn,
        CurrentConfig.tokens.in.decimals
      ).toString()
    ),
    TradeType.EXACT_INPUT,
    {
      useQuoterV2: true,
    }
  );

  const quoteCallReturnData = await provider.call({
    to: QUOTER_CONTRACT_ADDRESS,
    data: calldata,
  });

  // return ethers.utils.defaultAbiCoder.decode(['uint256'], quoteCallReturnData)[0];
  return ethers.utils.defaultAbiCoder.decode(['uint256'], quoteCallReturnData);

}

async function getTokenTransferApproval(token) {
  const provider = getProvider();
  const address = getWalletAddress();
  console.log("wallet address",address);
  if (!provider || !address) {
    console.log('No Provider Found');
    return TransactionState.Failed;
  }

  try {
    const tokenContract = new ethers.Contract(
      token.address,
      ERC20_ABI,
      provider
    );
    // const signer = address.connect(provider);
    const signer = provider.getSigner(address);


    const approvalResponse = await tokenContract.connect(signer).approve(
      SWAP_ROUTER_ADDRESS,
      fromReadableAmount(
        TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER,
        token.decimals
      ).toString()
    );
    // const approvalResponse0 = await tokenContract.connect(signer).approve(
    //   currentPoolAddress,
    //   fromReadableAmount(
    //     TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER,
    //     token.decimals
    //   ).toString()
    // );
    
    // const transaction = await tokenContract.populateTransaction.approve(
    //   SWAP_ROUTER_ADDRESS,
    //   fromReadableAmount(
    //     TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER,
    //     token.decimals
    //   ).toString()
    // );  
    const transaction ={
      data:approvalResponse.data,
      to:approvalResponse.to
    }

    console.log("approval with signer",approvalResponse);

    console.log("approval transaction",transaction);

    return await sendTransaction({
      ...transaction,
      from: address,
    });
  } catch (e) {
    console.error(e);
    return TransactionState.Failed;
  }
}

module.exports = {
  createTrade,
  executeTrade,
  getTokenTransferApproval,
  getOutputQuote
};

// // Add this at the bottom of your trading.js file

// Immediately Invoked Function Expression (IIFE) to use async-await at the top level
(async () => {
  console.log('Starting trading script...');

  // Debugging network connection
  const provider = getProvider();
  try {
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    const blockNumber = await provider.getBlockNumber();
    console.log(`Current Block Number: ${blockNumber}`);
  } catch (error) {
    console.error('Network connection error:', error);
    // Return or throw an error to stop execution if the network connection fails
    return;
  }

  // Continue with the existing logic
  try {
    console.log("Approving tokens...");
const approvalResult = await getTokenTransferApproval(CurrentConfig.tokens.in);
console.log(`Approval status: ${approvalResult}`);

if (approvalResult !== TransactionState.Sent) {
    console.error("Token approval failed.");
    return;
}

console.log("Creating trade...");
const trade = await createTrade();
console.log("Trade details:", JSON.stringify(trade, null, 2));

console.log("Executing trade...");
const executionResult = await executeTrade(trade);
console.log(`Execution result: ${executionResult}`);

    trade.swaps.forEach((swap, index) => {
      console.log(`Swap ${index + 1}:`);
      console.log(`  Input Amount: ${swap.inputAmount.toSignificant(6)} ${swap.inputAmount.currency.symbol}`);
      console.log(`  Output Amount: ${swap.outputAmount.toSignificant(6)} ${swap.outputAmount.currency.symbol}`);
    
      // Check if swap.route and swap.route.path are defined before attempting to map
      if (swap.route && swap.route.path) {
        console.log(`  Route: ${swap.route.path.map(token => token.symbol).join(' -> ')}`);
      } else {
        console.log('  Route information is unavailable');
      }
    });

    console.log('Executing trade...');
    const result = await executeTrade(trade);
    console.log('Trade execution result:', result);
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
