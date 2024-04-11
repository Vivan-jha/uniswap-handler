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
const { getPoolInfo } = require('./pool');
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

  const options = {
    slippageTolerance: new Percent(50, 10_000),
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    recipient: walletAddress,
  };

  const methodParameters = SwapRouter.swapCallParameters([trade], options);

  const tx = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_ADDRESS,
    value: methodParameters.value,
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

  return ethers.utils.defaultAbiCoder.decode(['uint256'], quoteCallReturnData)[0];
}

async function getTokenTransferApproval(token) {
  const provider = getProvider();
  const address = getWalletAddress();
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

    const transaction = await tokenContract.populateTransaction.approve(
      SWAP_ROUTER_ADDRESS,
      fromReadableAmount(
        TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER,
        token.decimals
      ).toString()
    );

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

// Add this at the bottom of your trading.js file

// Immediately Invoked Function Expression (IIFE) to use async-await at the top level
(async () => {
  console.log('Starting trading script...');

  try {
    console.log('Creating trade...');
    const trade = await createTrade();
    console.log('Trade created:', trade);
    console.log('Trade created:');
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
