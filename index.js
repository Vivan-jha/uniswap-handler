const axios = require("axios");
const ethers = require("ethers");
var express = require("express");
var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
require("dotenv").config();

const qs = require("qs");

const erc20abi = require("./abi/ERC20.json");
const priceOracleAbi = require("./abi/Oracle.json");
const ZEROEX_ROUTER_ADDRESS = "0xDef1C0ded9bec7F1a1670819833240f027b25EfF";
const ONEINCH_ROUTER_ADDRESS = "0x111111125421cA6dc452d289314280a0f8842A65";
const PARASWAP_ROUTER_ADDRESS="0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57";
const PARASWAP_TOKEN_TRANSFER_PROXY="0x216b4b4ba9f3e719726886d34a177484278bfcae";
const provider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL,
  { name: "bsc", chainId: 56 }
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
    res.json(results.filter((result) => result !== null)); // Filter out any null results
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching swap data");
  }
});

async function getSwapDataInternal(
  sellTokenAddress,
  buyTokenAddress,
  sellTokenAmount,
  fee
) {
  try {
    // const fees = await getZeroExPriceData(
    //   sellTokenAddress,
    //   sellTokenAmount,
    //   fee
    // );
    const [zeroExData, oneInchData, paraSwapResponse] = await Promise.all([
      getZeroExSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount),
      getOneInchSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount),
      getParaSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount) 
    ]);
    
    // const paraSwapData = paraSwapResponse ? paraSwapResponse.transactionData : null;
    // const paraSwapPriceRoute = paraSwapResponse ? paraSwapResponse.priceRoute : null;
    const { priceRoute: paraSwapPriceRoute, transactionData: paraSwapData } = paraSwapResponse || {};

    // console.log("Zer0 X data", zeroExData);
    // console.log("1inch data", oneInchData);
    // console.log(" paraswapdata",paraSwapPriceRoute);
    // console.log("transaction",paraSwapData);
     // Directly destructure the paraSwapResponse to get priceRoute and transactionData
      // Print prepared data for each protocol
      console.log("paraswap response",paraSwapResponse);

    const prepareResponseforParaswap = async (data, protocol, routerAddress,tokenRouter) => {
      console.log("data",data);
      return {
        sellTokenAddress:data.priceRoute.srcToken,
        sellTokenAmount: data.priceRoute.srcAmount,
        buyTokenAddress: data.priceRoute.destToken,
        buyTokenAmount:data.priceRoute.destAmount,
        calldata: [
          await approveToken(sellTokenAddress,tokenRouter,sellTokenAmount),
          data.transactionData.data,
        ],
        to: [sellTokenAddress,routerAddress],
        gas: data.transactionData.gas,
        protocol,
      };
    };
    const prepareResponse = async (data, protocol, routerAddress) => ({
      sellTokenAddress: data.sellTokenAddress || data.tx.from,
      sellTokenAmount: sellTokenAmount,
      buyTokenAddress: data.buyTokenAddress || data.tx.to,
      buyTokenAmount: data.grossBuyAmount || data.toAmount || data.dstAmount,
      calldata: [
        await approveToken(sellTokenAddress, routerAddress, sellTokenAmount),
        data.data || data.tx.data,
      ],
      to: [sellTokenAddress, routerAddress],
      gas: data.estimatedGas || data.tx.gas,
      protocol,
    });

    const prepareResponsefor1inch = async (data , protocol , routerAddress) => ({
            sellTokenAddress : "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
            sellTokenAmount : sellTokenAmount,
            buyTokenAddress : "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
            buyTokenAmount : data.dstAmount,
            calldata : [
                await approveToken(sellTokenAddress, routerAddress, sellTokenAmount),
                data.data || data.tx.data,
            ],
            to: [sellTokenAddress, routerAddress],
            gas: data.estimatedGas || data.tx.gas,
            protocol,
    });
    // Parse amounts
    const zeroExAmount = parseFloat(zeroExData.grossBuyAmount) || 0;
    const oneInchAmount = parseFloat(oneInchData.dstAmount) || 0;
    const paraSwapAmount = parseFloat(paraSwapResponse ? paraSwapResponse.priceRoute.destAmount : 0);

    console.log("0x amount:", zeroExAmount);
    console.log("1inch amount:", oneInchAmount);
    console.log("ParaSwap amount:", paraSwapAmount);

    // Initialize variables to store the minimum amount and its corresponding data
    let minAmount = Math.min(zeroExAmount, oneInchAmount, paraSwapAmount);
    let responseData;

   
    if (minAmount === paraSwapAmount) {
      responseData = await prepareResponseforParaswap(paraSwapResponse.priceRoute, "ParaSwap", PARASWAP_ROUTER_ADDRESS,PARASWAP_TOKEN_TRANSFER_PROXY);
    } else if (minAmount === oneInchAmount) {
      responseData = await prepareResponsefor1inch(oneInchData, "1Inch", ONEINCH_ROUTER_ADDRESS);
    } else { // This assumes ParaSwap has the least favorable rate or they are all zero
      responseData = await prepareResponse(zeroExData, "ZeroEx", ZEROEX_ROUTER_ADDRESS);
    }
    console.log(paraSwapResponse);
    console.log("Most favorable rate:", responseData);
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
      // feeRecipient: "0x2F31eAba480d133d3cC7326584B0C40eFacecaDB",
      // buyTokenPercentageFee: fee,
      // feeRecipientTradeSurplus: "0x2F31eAba480d133d3cC7326584B0C40eFacecaDB",
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
    // console.log(response.data)
    return response.data;
  } catch (e) {
    console.log("0x Error", e);
  }
}

async function getOneInchSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount, retryCount = 0) {
  try {
    await delay(100); // Ensures there's a slight delay before making the request
    const params = {
      src: sellTokenAddress,
      dst: buyTokenAddress,
      amount: sellTokenAmount,
      from: "0xbEbEbEb035351f58602E0C1C8B59ECBfF5d5f47b", // This seems like a fixed address. Ensure it's intended to be static.
      slippage: 0.01,
      disableEstimate: true,
      includeGas: true,
    };
    const response = await axios.get(
      `https://api.1inch.dev/swap/v6.0/56/swap?${qs.stringify(params)}`, // Corrected to use backticks for template literal
      {
        headers: {
          Authorization: `Bearer ${process.env.ONEINCH_API_KEY}`, // Corrected to use backticks for template literal
        },
      }
    );
    return response.data;
  } catch (e) {
    console.log("1inch Error", e.message);
    if (e.response && e.response.status === 429 && retryCount < 5) { 
      const waitTime = Math.pow(2, retryCount) * 1000; 
      console.log(`Waiting ${waitTime} ms before retrying...`); // Corrected to use backticks for template literal
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
      userAddress:"0x21bEFE10698876Fbc96983Aee77651a75583B850",
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
async function getZeroExPriceData(
  sellTokenAddress,
  sellTokenAmount,
  feesTobeCharged
) {
  try {
    const [sellTokenPriceResponse, decimals] = await Promise.all([
      axios.get(
        `https://bsc.api.0x.org/swap/v1/price?${qs.stringify({
          sellToken: sellTokenAddress,
          buyToken: "0x55d398326f99059fF775485246999027B3197955",
          sellAmount: sellTokenAmount,
        })}`,
        {
          headers: { "0x-api-key": process.env.ZEROEX_API_KEY },
        }
      ),
      getTokenDecimals(sellTokenAddress, provider),
    ]);

    // const sellTokenPriceResponse = await axios.get("https://api.bebop.xyz/tokens/v1/bsc/"+sellTokenAddress+"/chart");

    // const priceOracle = new ethers.Contract("0xC2f2Bf0c228714d038c2495343224c0d9199cC82",priceOracleAbi.abi,provider);
    // const price = await priceOracle.callStatic.getPriceForOneTokenInUSD(sellTokenAddress);
    // const record = sellTokenPriceResponse.data;
    // const length = record.length;
    // const sellTokenPriceInUSD = record[length-1].c;
    const sellTokenPriceInUSD = sellTokenPriceResponse.data.price;
    // console.log(sellTokenPriceInUSD);
    // const decimals = await
    const sellTokenAmountBN = ethers.utils.parseUnits(
      sellTokenAmount.toString(),
      decimals
    );
    const sellTokenAmountInUSD = sellTokenAmountBN
      .mul(ethers.utils.parseUnits(sellTokenPriceInUSD.toString(), 18))
      .div(ethers.utils.parseUnits("1", 18 + decimals)); // Adjusting for decimal places
    const feeInSellTokenPercentage =
      feesTobeCharged /
      parseFloat(ethers.utils.formatUnits(sellTokenAmountInUSD, decimals));
    return feeInSellTokenPercentage;
  } catch (e) {
    console.error("Error fetching 0x price data:", e);
    throw e;
  }
}
var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log("Example app listening at http://localhost", host, port);
});