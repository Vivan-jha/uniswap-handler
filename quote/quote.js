const { ethers } = require('ethers');
const { CurrentConfig } = require('./config');
const { computePoolAddress } = require('@uniswap/v3-sdk');
const Quoter = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json');
const IUniswapV3PoolABI = require('@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json');
const {
  POOL_FACTORY_CONTRACT_ADDRESS,
  QUOTER_CONTRACT_ADDRESS,
} = require('./constants');
const { getProvider } = require('./providers');
const { toReadableAmount, fromReadableAmount } = require('./conversion');

async function quote() {
  console.log("Running quote function...");
  const quoterContract = new ethers.Contract(
    QUOTER_CONTRACT_ADDRESS,
    Quoter.abi,
    getProvider()
  );
  const poolConstants = await getPoolConstants();

  const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
    poolConstants.token0,
    poolConstants.token1,
    poolConstants.fee,
    fromReadableAmount(
      CurrentConfig.tokens.amountIn,
      CurrentConfig.tokens.in.decimals
    ).toString(),
    0
  );

  return toReadableAmount(quotedAmountOut, CurrentConfig.tokens.out.decimals);
}

async function getPoolConstants() {
  const currentPoolAddress = computePoolAddress({
    factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
    tokenA: CurrentConfig.tokens.in,
    tokenB: CurrentConfig.tokens.out,
    fee: CurrentConfig.tokens.poolFee,
  });

  const poolContract = new ethers.Contract(
    currentPoolAddress,
    IUniswapV3PoolABI.abi,
    getProvider()
  );
  const [token0, token1, fee] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
  ]);

  return {
    token0,
    token1,
    fee,
  };
}

module.exports = { quote };

// Self-invoking function to test the quote function
(async () => {
  console.log("Starting the quote process...");
  try {
    const result = await quote();
    console.log("Quoted Amount:", result);
  } catch (error) {
    console.error("Error obtaining quote:", error.message);
  }
})();
