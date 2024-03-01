const axios = require("axios");
const ethers = require("ethers");
var express = require("express");
var app = express();
require('dotenv').config()

const qs = require("qs");

const erc20abi = require('./abi/ERC20.json');
const TOKEN_CONTRACT_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; 
const ZEROEX_ROUTER_ADDRESS = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'; 
const ONEINCH_ROUTER_ADDRESS = '0x1111111254fb6c44bac0bed2854e76f90643097d';
const PARASWAP_TRANSFER_HELPER_ADDRESS = '0x55A0E3b6579972055fAA983482acEb4B251dcF15'; 


const provider = new ethers.providers.JsonRpcProvider(
  "https://binance.llamarpc.com",
  {
    name: "bsc",
    chainId: 56,
  }
);

const privateKey = 'bf104dcce9d28bc2280701749d2d7dd184ad49695b8b9f38e1e924ec8482640c';
const wallet = new ethers.Wallet(privateKey, provider); 
const signer = wallet.provider.getSigner(wallet.address);



app.get("/bestRates", async function (req,res){
    try{
        const r = await getSwapData(req.query.sellTokenAddress,req.query.buyTokenAddress,req.query.sellTokenAmount)
        res.send(r);
    }catch(e){
        console.log(e);
        res.status(500);
    }
})

async function getRatesArray(sellTokenArray, buyTokenArray, sellAmountArray){
  try {
    if (!(sellTokenArray.length === buyTokenArray.length && sellTokenArray.length === sellAmountArray.length)) {
      throw new Error("Input arrays must have the same length.");
    }
    let rateResults = [];

    for (let i = 0; i < sellTokenArray.length; i++) {
      let rateResult = await getSwapData(sellTokenArray[i], buyTokenArray[i], sellAmountArray[i]);
      if(rateResult !== null) {
        rateResults.push(rateResult);
      } else {
        console.log(`Failed to get swap data for pair index ${i}`);
        rateResults.push(null);
      }
    }
    
    return rateResults;
  } catch (e) {
    console.error("An error occurred in getRatesArray:", e);
  }
}

async function approveToken(contractAddress, spender, amount) {
  try {
    const tokenContract = new ethers.Contract(contractAddress, erc20abi.abi, signer);


    const calldata = tokenContract.interface.encodeFunctionData("approve", [spender, amount]);
    return calldata;
  } catch (error) {
    console.error("Approval Error:", error);
    throw error;
  }
}

function delay(ms) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}


async function getSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount){
    const zeroExData = await getZeroExSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount);
    const oneInchData = await getOneInchSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount);

    if(zeroExData.grossBuyAmount == null){
      if(oneInchData.toAmount == null){
        console.log("Error in fetching rates on both 0x and 1inch");
        return null;
      }else{
        let approvaldata=approveToken(sellTokenAddress,ONEINCH_ROUTER_ADDRESS,sellTokenAmount);
        let temp = {
          sellTokenAddress: oneInchData.tx.from,
          buyTokenAddress: oneInchData.tx.to,
          sellTokenAmount: oneInchData.toAmount,
          calldata: [approvaldata,oneInchData.tx.data],
          protocol: "1Inch"
        }
        return(temp);
      }
    }else if(oneInchData.toAmount == null){
      if(zeroExData.grossBuyAmount == null){
        console.log("Error in fetching rates on both 0x and 1inch");
        return null;
      }else{
        approvaldata=approveToken(sellTokenAddress,ZEROEX_ROUTER_ADDRESS,sellTokenAmount);
        let temp = {
          sellTokenAddress: zeroExData.sellTokenAddress,
          buyTokenAddress: zeroExData.buyTokenAddress,
          sellTokenAmount: zeroExData.grossBuyAmount,
          calldata: [approvaldata,zeroExData.data],
          protocol: "ZeroEx"
        }
        return(temp);
      }
    }else{
      if(zeroExData.grossBuyAmount >= oneInchData.tx.toAmount){
        approvaldata=approveToken(sellTokenAddress,ZEROEX_ROUTER_ADDRESS,sellTokenAmount);
        let temp = {
          sellTokenAddress: zeroExData.sellTokenAddress,
          buyTokenAddress: zeroExData.buyTokenAddress,
          sellTokenAmount: zeroExData.grossBuyAmount,
          calldata:[approvaldata,zeroExData.data],
          protocol: "ZeroEx"
        }
        return(temp);
      }else{
        let approvaldata=approveToken(sellTokenAddress,ONEINCH_ROUTER_ADDRESS,sellTokenAmount);
        let temp = {
          sellTokenAddress: oneInchData.tx.from,
          buyTokenAddress: oneInchData.tx.to,
          sellTokenAmount: oneInchData.toAmount,
          calldata: [approvaldata,oneInchData.tx.data],
          protocol: "1Inch"
        }
        return(temp);
      }
    }
}
async function getZeroExSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount){
  try{
    const params = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        sellAmount: sellTokenAmount,
        slippagePercentage: 0.01,
        skipValidation: true
      }
      const response = await axios.get(
        `https://bsc.api.0x.org/swap/v1/quote?${qs.stringify(params)}`,
        {
          headers: {
            '0x-api-key': process.env.ZEROEX_API_KEY,
          },
        }
      )
      return(response.data);
}catch(e){
    console.log("0x Error",e);
}
}
async function getOneInchSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount){
  try{
    await delay(1000);
    const params = {
      src: sellTokenAddress,
      dst: buyTokenAddress,
      amount: sellTokenAmount,
      from: "0xbEbEbEb035351f58602E0C1C8B59ECBfF5d5f47b",
      slippage: 0.01,
      disableEstimate: true,
      skipValidation: true
      }
      const response = await axios.get(
        `https://api.1inch.dev/swap/v5.2/56/swap?${qs.stringify(params)}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.ONEINCH_API_KEY}`,
          },
        }
      )
      return(response.data);
}catch(e){
    console.log("0x Error",e);
}
}
async function getParaSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount){
  try{
    const params = {
      srcToken: sellTokenAddress,
      destToken: buyTokenAddress,
      amount: sellTokenAmount,
      network:56,
      srcDecimals:18,
      destDecimals:6,
      side:'SELL'
      }
      const response = await axios.get(
        `https://apiv5.paraswap.io/prices/?${qs.stringify(params)}`
      )
      return(response.data);
 }catch(e){
    console.log("Paraswap Error",e);
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


 
 

var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;
  
    console.log("Example app listening at http://localhost", host, port);
});