const axios = require("axios");
const ethers = require("ethers");
var express = require("express");
var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
require("dotenv").config();

const qs = require("qs");

const erc20abi = require("./abi/ERC20.json");
const ZEROEX_ROUTER_ADDRESS = "0xDef1C0ded9bec7F1a1670819833240f027b25EfF";
const ONEINCH_ROUTER_ADDRESS = "0x111111125421cA6dc452d289314280a0f8842A65";
const PARASWAP_ROUTER_ADDRESS="0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57";
const PARASWAP_TOKEN_TRANSFER_PROXY="0x216b4b4ba9f3e719726886d34a177484278bfcae";
const BEBOP_ADDRESS = "0xbEbEbEb035351f58602E0C1C8B59ECBfF5d5f47b";
const CHAIN_ID = 56;

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
    res.json(results.filter((result) => result !== null)); 
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching swap data");
  }
});

async function prepareResponse(data, protocol, routerAddress, sellTokenAddress, sellTokenAmount, buyTokenAddress, tokenRouter = null ) {
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
    gas =  data.transactionData.gas;
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
    const oneInchAmount = parseFloat(oneInchData.dstAmount) || 0;
    const paraSwapAmount = parseFloat(paraSwapResponse ? paraSwapResponse.priceRoute.destAmount : 0);

    let MaxAmount = Math.max(zeroExAmount, oneInchAmount, paraSwapAmount);
    console.log("Maximum Amount : ", MaxAmount);
    let responseData;
    
    console.log("buytoken address" , buyTokenAddress)
    if (MaxAmount === paraSwapAmount) {
     responseData = await prepareResponse(
        paraSwapResponse, 
        "ParaSwap", 
        PARASWAP_ROUTER_ADDRESS, 
        sellTokenAddress, 
        sellTokenAmount, 
        buyTokenAddress,
        PARASWAP_TOKEN_TRANSFER_PROXY 
      );
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
    console.log("1inch Error", e.message);
    if (e.response && e.response.status === 429 && retryCount < 5) { 
      const waitTime = Math.pow(2, retryCount) * 1000; 
      console.log(`Waiting ${waitTime} ms before retrying...`);
      await delay(waitTime);
      return getOneInchSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount, retryCount + 1); 
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
      srcDecimals:18,
      destDecimals:6,
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
      gasPrice:priceRouteData.gasCost,
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
const tokenDecimalsCache = {};
async function getTokenDecimals(tokenAddress, provider) {
  if (!tokenDecimalsCache[tokenAddress]) {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20abi.abi,
      provider
    );
    const decimals = await tokenContract.callStatic.decimals();
    tokenDecimalsCache[tokenAddress] = decimals; // Cache the decimals
  }
  return tokenDecimalsCache[tokenAddress];
}

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log("Example app listening at http://localhost", host, port);
});
