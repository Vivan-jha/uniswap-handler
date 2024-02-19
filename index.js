const axios = require("axios");
const ethers = require("ethers");
var express = require("express");
var app = express();
require('dotenv').config()

const qs = require("qs");

const erc20abi = require('./abi/ERC20.json');

const provider = new ethers.providers.JsonRpcProvider(
  "https://eth.llamarpc.com",
    {
      name: "eth",
      chainId: 1,
    }
  );

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


async function getSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount){
    const zeroExData = await getZeroExSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount);
    const oneInchData = await getOneInchSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount);

    if(zeroExData.grossBuyAmount == null){
      if(oneInchData.toAmount == null){
        console.log("Error in fetching rates on both 0x and 1inch");
        return null;
      }else{
        let temp = {
          sellTokenAddress: oneInchData.tx.from,
          buyTokenAddress: oneInchData.tx.to,
          sellTokenAmount: oneInchData.toAmount,
          calldata: oneInchData.tx.data,
          protocol: "1Inch"
        }
        return(temp);
      }
    }else if(oneInchData.toAmount == null){
      if(zeroExData.grossBuyAmount == null){
        console.log("Error in fetching rates on both 0x and 1inch");
        return null;
      }else{
        let temp = {
          sellTokenAddress: zeroExData.sellTokenAddress,
          buyTokenAddress: zeroExData.buyTokenAddress,
          sellTokenAmount: zeroExData.grossBuyAmount,
          calldata: zeroExData.data,
          protocol: "ZeroEx"
        }
        return(temp);
      }
    }else{
      if(zeroExData.grossBuyAmount >= oneInchData.tx.toAmount){
        let temp = {
          sellTokenAddress: zeroExData.sellTokenAddress,
          buyTokenAddress: zeroExData.buyTokenAddress,
          sellTokenAmount: zeroExData.grossBuyAmount,
          calldata: zeroExData.data,
          protocol: "ZeroEx"
        }
        return(temp);
      }else{
        let temp = {
          sellTokenAddress: oneInchData.tx.from,
          buyTokenAddress: oneInchData.tx.to,
          sellTokenAmount: oneInchData.toAmount,
          calldata: oneInchData.tx.data,
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
var server = app.listen(2000, function () {
    var host = server.address().address;
    var port = server.address().port;
  
    console.log("Example app listening at http://localhost", host, port);
});