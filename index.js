const axios = require("axios");
const ethers = require("ethers");
var express = require("express");
var app = express();
app.use(express.json());
app.use(express.urlencoded({extended: true}));
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

app.post("/bestRates", async function (req,res){
    try{
        const r = await getSwapData(req.body.sellTokenAddress,req.body.buyTokenAddress,req.body.sellTokenAmount) 
        res.send(r);
    }catch(e){
        console.log(e);
        res.status(500);
    }
})
async function getSwapData(sellTokenAddress, buyTokenAddress, sellTokenAmount) {
  if ((sellTokenAddress.length != buyTokenAddress.length || sellTokenAddress.length != sellTokenAmount.length)) {
    throw new Error("Input arrays must have the same length.");
  }
  const responseArray = [];
  for(let i =0;i<sellTokenAddress.length;i++){
    console.log(sellTokenAddress[i],buyTokenAddress[i],sellTokenAmount[i])
    responseArray.push(await getSwapDataInternal(sellTokenAddress[i],buyTokenAddress[i],sellTokenAmount[i]));
  }
  return responseArray;
}
async function getSwapDataInternal(sellTokenAddress,buyTokenAddress,sellTokenAmount){
  try{
  const zeroExData = await getZeroExSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount);
  const oneInchData = await getOneInchSwapData(sellTokenAddress,buyTokenAddress,sellTokenAmount);

  console.log(zeroExData);
  console.log(oneInchData)

  if(zeroExData.grossBuyAmount == null){
    if(oneInchData.toAmount == null){
      console.log("Error in fetching rates on both 0x and 1inch");
      return null;
    }else{
      let approvaldata=await approveToken(sellTokenAddress,ONEINCH_ROUTER_ADDRESS,sellTokenAmount);
      let temp = {
        sellTokenAddress: oneInchData.tx.from,
        sellTokenAmount: sellTokenAmount,
        buyTokenAddress: oneInchData.tx.to,
        buyTokenAmount: oneInchData.toAmount,
        calldata: [approvaldata,oneInchData.tx.data],
        gas: oneInchData.tx.gas,
        protocol: "1Inch"
      }
      return(temp);
    }
  }else if(oneInchData.toAmount == null){
    if(zeroExData.grossBuyAmount == null){
      console.log("Error in fetching rates on both 0x and 1inch");
      return null;
    }else{
      approvaldata=await approveToken(sellTokenAddress,ZEROEX_ROUTER_ADDRESS,sellTokenAmount);
      let temp = {
        sellTokenAddress: zeroExData.sellTokenAddress,
        sellTokenAmount: sellTokenAmount,
        buyTokenAddress: zeroExData.buyTokenAddress,
        buyTokenAmount: zeroExData.grossBuyAmount,
        calldata: [approvaldata,zeroExData.data],
        gas: zeroExData.estimatedGas,
        protocol: "ZeroEx"
      }
      return(temp);
    }
  }else{
    if(zeroExData.grossBuyAmount >= oneInchData.tx.toAmount){
      approvaldata=await approveToken(sellTokenAddress,ZEROEX_ROUTER_ADDRESS,sellTokenAmount);
      let temp = {
        sellTokenAddress: zeroExData.sellTokenAddress,
        sellTokenAmount: sellTokenAmount,
        buyTokenAddress: zeroExData.buyTokenAddress,
        buyTokenAmount: zeroExData.grossBuyAmount,
        calldata:[approvaldata,zeroExData.data],
        gas: zeroExData.estimatedGas,
        protocol: "ZeroEx"
      }
      return(temp);
    }else{
      let approvaldata=await approveToken(sellTokenAddress,ONEINCH_ROUTER_ADDRESS,sellTokenAmount);
      let temp = {
        sellTokenAddress: oneInchData.tx.from,
        sellTokenAmount: sellTokenAmount,
        buyTokenAddress: oneInchData.tx.to,
        buyTokenAmount: oneInchData.toAmount,
        calldata: [approvaldata,oneInchData.tx.data],
        gas: oneInchData.tx.gas,
        protocol: "1Inch"
      }
      return(temp);
    }
  }
}catch(e){
  console.log("ERROR IN MAKING DATA", e);
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
      includeGas: true
      }
      const response = await axios.get(
        `https://api.1inch.dev/swap/v6.0/56/swap?${qs.stringify(params)}`,
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
async function approveToken(contractAddress, spender, amount) {
  try {
    const tokenContract = new ethers.Contract(contractAddress, erc20abi.abi, provider);
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
var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;
  
    console.log("Example app listening at http://localhost", host, port);
});