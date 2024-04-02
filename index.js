const axios = require("axios");
const ethers = require("ethers");
var express = require("express");
var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
require("dotenv").config();
var BigNumber = require("big-number");
const fs = require("fs");

const qs = require("qs");

const erc20abi = require("./abi/ERC20.json");
const ZEROEX_ROUTER_ADDRESS = process.env.ZEROEX_ROUTER_ADDRESS;
const ONEINCH_ROUTER_ADDRESS = process.env.ONEINCH_ROUTER_ADDRESS;
const PARASWAP_ROUTER_ADDRESS = process.env.PARASWAP_ROUTER_ADDRESS;
const PARASWAP_TOKEN_TRANSFER_PROXY = process.env.PARASWAP_TOKEN_TRANSFER_PROXY;
const BEBOP_ADDRESS = process.env.BEBOP_ADDRESS;
const CHAIN_ID = 56;


console.log("Router::ZeroEx - ", ZEROEX_ROUTER_ADDRESS)
console.log("Router::OneInch - ", ONEINCH_ROUTER_ADDRESS)
console.log("Router::Paraswap - ", PARASWAP_ROUTER_ADDRESS)
console.log("Proxy::Paraswap - ", PARASWAP_TOKEN_TRANSFER_PROXY)
console.log("\nAuctioneer::Bebop:: - ", BEBOP_ADDRESS)

const provider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL,
  { name: "bsc", chainId: CHAIN_ID }
);

app.post("/bestRates", async (req, res) => {
  try {
    console.log("CALLED POST REQUEST");
    const fees = req.body.feeToCharge / req.body.sellTokenAddress.length;
    const promises = req.body.sellTokenAddress.map((address, index) =>
      getSwapDataInternal(
        address,
        req.body.buyTokenAddress[index],
        req.body.sellTokenAmount[index],
        fees
      )
    );
    const results = await Promise.all(promises);

    console.log("Results: ", results);
    res.json(results.filter((result) => result !== null)); // Filter out any null results
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching swap data");
  }
});

async function prepareResponse(data, protocol, routerAddress, sellTokenAddress, sellTokenAmount, buyTokenAddress, tokenRouter = null) {
  let approvalCalldata = null;
  let swapCalldata = null;
  let buyTokenAmount = null;
  let gas = null;

  if (protocol === "ZeroEx" || protocol === "1Inch") {
    approvalCalldata = await approveToken(sellTokenAddress, routerAddress, sellTokenAmount).catch(error => {
      console.error(`Error preparing approval for ${protocol}:`, error);
      return null;
    });
    swapCalldata = data.data || data.tx?.data;
    buyTokenAmount = data.buyAmount || data.destAmount || data.grossBuyAmount || data.dstAmount;
    gas = data.estimatedGas || data.tx.gas;
  } else if (protocol === "ParaSwap" && tokenRouter) {
    approvalCalldata = await approveToken(sellTokenAddress, tokenRouter, sellTokenAmount).catch(error => {
      console.error("Error preparing approval for ParaSwap:", error);
      return null;
    });
    swapCalldata = data.transactionData.data;
    buyTokenAmount = data.priceRoute.destAmount;
    gas = data.transactionData.gas;
  }
  return {
    sellTokenAddress,
    sellTokenAmount,
    buyTokenAddress,
    buyTokenAmount,
    calldata: [
      approvalCalldata,
      swapCalldata
    ],
    to: [
      sellTokenAddress,
      routerAddress,
    ],
    gas,
    protocol,
  };
}

async function dumpToJsonFiles(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

async function getSwapDataInternal(
  sellTokenAddress,
  buyTokenAddress,
  sellTokenAmount,
  fee
) {
  try {

    const [zeroExData, oneInchData, paraSwapResponse] = await Promise.all([
      getZeroExSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount),
      getOneInchSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount),
      getParaSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount)

    ]);
    const zeroExAmount = parseFloat(zeroExData.grossBuyAmount) || 0;
    // const zeroExAmount = 0;
    const oneInchAmount = parseFloat(oneInchData.dstAmount) || 0;
    // const oneInchAmount = 0;
    const paraSwapAmount = parseFloat(paraSwapResponse ? paraSwapResponse.priceRoute.destAmount : 0);
    // const paraSwapAmount = 0;

    // dump all data to quote_<>.json files for debugging

    // await dumpToJsonFiles(zeroExData, 'gold/quote_zeroEx.json');
    // await dumpToJsonFiles(oneInchData, 'gold/quote_oneInch.json');
    // await dumpToJsonFiles(paraSwapResponse, 'gold/quote_paraswap.json');

    console.log("BuyAmount::ZeroEx - ", zeroExAmount);
    console.log("BuyAmount::1Inch - ", oneInchAmount);
    console.log("BuyAmount::ParaSwap - ", paraSwapAmount);

    let MaxAmount = Math.max(zeroExAmount, oneInchAmount, paraSwapAmount);
    console.log("Maximum Amount : ", MaxAmount);

    const prepareResponseforParaswap = async (
      data,
      protocol,
      proxyAddress,
      routerAddress,
      buyAmount
    ) => {
      return {
        sellTokenAddress: data.priceRoute.srcToken,
        sellTokenAmount: data.priceRoute.srcAmount,
        buyTokenAddress: data.priceRoute.destToken,
        buyTokenAmount: data.priceRoute.destAmount,
        calldata: [
          await approveToken(sellTokenAddress, proxyAddress, sellTokenAmount),
          data.transactionData.data,
          await transferToken(
            buyTokenAddress,
            process.env.USER_ADDRESS,
            data.priceRoute.destAmount -
            BigNumber(data.priceRoute.destAmount)
              .multiply(99)
              .divide(100)
          ),
        ],
        to: [sellTokenAddress, routerAddress, buyTokenAddress],
        gas: data.transactionData.gas,
        protocol,
      };
    };

    let responseData;

    console.log("buytoken address", buyTokenAddress)
    if (MaxAmount === paraSwapAmount) {
      responseData = await prepareResponseforParaswap(
        paraSwapResponse,
        "ParaSwap",
        PARASWAP_TOKEN_TRANSFER_PROXY,
        PARASWAP_ROUTER_ADDRESS,
        // buyTokenAmount
      );
      console.log("Most favorable rate:", responseData);
      return responseData;
    } else if (MaxAmount === oneInchAmount) {
      responseData = await prepareResponse(
        oneInchData,
        "1Inch",
        ONEINCH_ROUTER_ADDRESS,
        sellTokenAddress,
        sellTokenAmount,
        buyTokenAddress,
      );
    } else {
      responseData = await prepareResponse(
        zeroExData,
        "ZeroEx",
        ZEROEX_ROUTER_ADDRESS,
        sellTokenAddress,
        sellTokenAmount,
        buyTokenAddress
      );
    }

    console.log("Response Data : ", responseData);
    return responseData;

  } catch (error) {
    console.error("Error in fetching swap data:", error);
    return null;
  }
}

async function getZeroExSwapData(
  sellTokenAddress,
  buyTokenAddress,
  sellTokenAmount,
  fee
) {
  try {
    const params = {
      sellToken: sellTokenAddress,
      buyToken: buyTokenAddress,
      sellAmount: sellTokenAmount,
      slippagePercentage: 0.01,
      skipValidation: true,

    };
    console.log(fee)
    const response = await axios.get(
      `https://bsc.api.0x.org/swap/v1/quote?${qs.stringify(params)}`,
      {
        headers: {
          "0x-api-key": process.env.ZEROEX_API_KEY,
        },
      }
    );
    return response.data;
  } catch (e) {
    console.log("0x Error", e);
  }
}


async function getOneInchSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount, retryCount = 0) {

  try {
    await delay(100);
    const params = {
      src: sellTokenAddress,
      dst: buyTokenAddress,
      amount: sellTokenAmount,
      from: BEBOP_ADDRESS,
      slippage: 0.01,
      disableEstimate: true,
      includeGas: true,
    };
    const response = await axios.get(
      `https://api.1inch.dev/swap/v6.0/56/swap?${qs.stringify(params)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.ONEINCH_API_KEY}`,
        },
      }
    );
    return response.data;
  } catch (e) {

    console.log("1inch Error", e.response ? e.response.data : e.message);
    if (e.response && e.response.status === 429 && retryCount < 5) {
      const waitTime = Math.pow(2, retryCount) * 1000;
      console.log(`Waiting ${waitTime} ms before retrying...`);
      await delay(waitTime);
      return getOneInchSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount, fee, retryCount + 1);
    } else {
      throw e;
    }
  }
}
async function getParaSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount) {
  try {
    const priceRouteParams = {
      srcToken: sellTokenAddress,
      destToken: buyTokenAddress,
      amount: sellTokenAmount,
      network: 56,
      srcDecimals: 18,
      destDecimals: 6,
      side: 'SELL',
    };
    const priceRouteResponse = await axios.get(
      `https://apiv5.paraswap.io/prices/?${qs.stringify(priceRouteParams)}`
    );
    const priceRouteData = priceRouteResponse.data.priceRoute;
    const buildTxParams = {
      network: 56,
      userAddress: process.env.USER_ADDRESS,
      priceRoute: priceRouteData,
      srcToken: priceRouteData.srcToken,
      destToken: priceRouteData.destToken,
      srcAmount: priceRouteData.srcAmount,

      destAmount: priceRouteData.destAmount,
      gasPrice: priceRouteData.gasCost,
      eip1559: false,
      ignoreChecks: false,
      ignoreGasEstimate: false,
    };

    const transactionData = await buildParaSwapTransaction(buildTxParams);
    return { priceRoute: priceRouteData, transactionData: transactionData };
  } catch (e) {
    console.log("Paraswap Error", e);
    return null;
  }
}


async function buildParaSwapTransaction({
  network,
  userAddress,
  priceRoute,
  srcToken,
  destToken,
  srcAmount,
  destAmount,
  slippage,
  gasPrice,
  eip1559,
  ignoreChecks,
  ignoreGasEstimate,
}) {
  const transactionParams = {
    network,
    userAddress,
    priceRoute,
    srcToken,
    destToken,
    srcAmount,
    destAmount,
    slippage,
    gasPrice,
    eip1559,
    ignoreChecks,
    ignoreGasEstimate,
  };


  try {
    const txResponse = await axios.post(
      `https://apiv5.paraswap.io/transactions/${network}`,
      transactionParams
    );
    return txResponse.data;
  } catch (error) {
    console.error('Transaction Build Error:', error);
    throw error;
  }
}

async function transferToken(contractAddress, receiver, amount) {
  try {
    const tokenContract = new ethers.Contract(
      contractAddress,
      erc20abi.abi,
      provider
    );
    const calldata = tokenContract.interface.encodeFunctionData("transfer", [
      receiver,
      BigInt(amount),
    ]);
    return calldata;
  } catch (error) {
    console.error("Transfer Error:", error);
    throw error;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function approveToken(contractAddress, spender, amount) {
  try {
    const tokenContract = new ethers.Contract(
      contractAddress,
      erc20abi.abi,
      provider
    );
    const calldata = tokenContract.interface.encodeFunctionData("approve", [
      spender,
      amount,
    ]);
    return calldata;
  } catch (error) {
    console.error("Approval Error:", error);
    throw error;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// const tokenDecimalsCache = {};

// async function getTokenDecimals(tokenAddress, provider) {

//   if (!tokenAddress || !provider) {
//     throw new Error('Token address or provider is null or undefined.');
//   }
//   tokenDecimalsCache[tokenAddress] = tokenDecimalsCache[tokenAddress] || (async () => {
//     const tokenContract = new ethers.Contract(tokenAddress, erc20abi.abi, provider);
//     return tokenContract.callStatic.decimals();
//   })();

//   return tokenDecimalsCache[tokenAddress];
// }


// async function getZeroExPriceData(sellTokenAddress, sellTokenAmount, feePercentage) {
//   const buyTokenAddress = "0x55d398326f99059fF775485246999027B3197955"; // Tether (USDT) address on BSC
//   const apiUrl = `https://bsc.api.0x.org/swap/v1/price?${qs.stringify({
//     sellToken: sellTokenAddress,
//     buyToken: buyTokenAddress,
//     sellAmount: sellTokenAmount,
//   })}`;

//   try {
//     const [{ data: priceData }, tokenDecimals] = await Promise.all([
//       axios.get(apiUrl, { headers: { "0x-api-key": process.env.ZEROEX_API_KEY } }),
//       getTokenDecimals(sellTokenAddress, provider),
//     ]);

//     const price = priceData.price;
//     const sellAmountBN = ethers.utils.parseUnits(sellTokenAmount.toString(), tokenDecimals);
//     const sellAmountInUSD = sellAmountBN.mul(ethers.utils.parseUnits(price.toString(), 18)).div(ethers.utils.parseUnits("1", 18 + tokenDecimals));
//     const feeInSellToken = calculateFee(sellAmountInUSD, feePercentage, tokenDecimals);

//     return feeInSellToken;
//   } catch (error) {
//     console.error("Error fetching 0x price data:", error);
//     throw new Error("Failed to fetch price data.");
//   }
// }

// async function getParaSwapPriceData(sellTokenAddress, buyTokenAddress, sellTokenAmount) {
//   try {
//     const params = {
//       srcToken: sellTokenAddress,
//       destToken: buyTokenAddress,
//       amount: sellTokenAmount,
//       side: 'SELL',
//       network: 56,
//     }
//     const response = await axios.get(`https://apiv5.paraswap.io/prices/?${qs.stringify(params)}`)

//     // console.log("Our Response data for paraswap ", response.data)
//     return response.data;
//   } catch (error) {
//     console.error("Error fetching Paraswap price data:", error);
//     return null;
//   }
// }

// function calculateFee(amountInUSD, feePercentage, decimals) {
//   const fee = feePercentage / parseFloat(ethers.utils.formatUnits(amountInUSD, decimals));
//   return fee;
// }

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log("\nVC::Central Server::\n\t..listening at http://localhost", host, port);
});
