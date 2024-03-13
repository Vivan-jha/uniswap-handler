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
const ONEINCH_ROUTER_ADDRESS = "0x1111111254fb6c44bac0bed2854e76f90643097d";

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
    const fees = await getZeroExPriceData(
      sellTokenAddress,
      sellTokenAmount,
      fee
    );
    const [zeroExData, oneInchData] = await Promise.all([
      getZeroExSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount, fees),
      // getOneInchSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount)
    ]);

    const prepareResponse = async (data, protocol, routerAddress) => ({
      sellTokenAddress: data.sellTokenAddress || data.tx.from,
      sellTokenAmount: sellTokenAmount,
      buyTokenAddress: data.buyTokenAddress || data.tx.to,
      buyTokenAmount: data.buyAmount || data.toAmount,
      calldata: [
        await approveToken(sellTokenAddress, routerAddress, sellTokenAmount),
        data.data || data.tx.data,
      ],
      to: [sellTokenAddress, routerAddress],
      gas: data.estimatedGas || data.tx.gas,
      protocol,
    });

    if (
      zeroExData.buyAmount &&
      (!oneInchData?.toAmount ||
        zeroExData.buyAmount >= oneInchData?.toAmount)
    ) {
      return prepareResponse(zeroExData, "ZeroEx", ZEROEX_ROUTER_ADDRESS);
    } else if (oneInchData?.toAmount) {
      return prepareResponse(oneInchData, "1Inch", ONEINCH_ROUTER_ADDRESS);
    } else {
      console.log("Error in fetching rates from both 0x and 1inch.");
      return null;
    }
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
      feeRecipient: "0x2F31eAba480d133d3cC7326584B0C40eFacecaDB",
      buyTokenPercentageFee: fee,
      feeRecipientTradeSurplus: "0x2F31eAba480d133d3cC7326584B0C40eFacecaDB",
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
    console.log(response.data)
    return response.data;
  } catch (e) {
    console.log("0x Error", e);
  }
}

async function getOneInchSwapData(
  sellTokenAddress,
  buyTokenAddress,
  sellTokenAmount
) {
  try {
    await delay(100);
    const params = {
      src: sellTokenAddress,
      dst: buyTokenAddress,
      amount: sellTokenAmount,
      from: "0xbEbEbEb035351f58602E0C1C8B59ECBfF5d5f47b",
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
    console.log("0x Error", e);
  }
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
