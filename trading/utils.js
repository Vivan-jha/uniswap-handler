const { ethers } = require('ethers');
const { Trade } = require('@uniswap/v3-sdk');

const MAX_DECIMALS = 4;

function fromReadableAmount(amount, decimals) {
  return ethers.utils.parseUnits(amount.toString(), decimals);
}

function toReadableAmount(rawAmount, decimals) {
  let formattedAmount = ethers.utils.formatUnits(rawAmount, decimals);
  let dotIndex = formattedAmount.indexOf('.');
  if (dotIndex !== -1 && dotIndex + MAX_DECIMALS + 1 < formattedAmount.length) {
    return formattedAmount.slice(0, dotIndex + MAX_DECIMALS + 1);
  }
  return formattedAmount;
}

function displayTrade(trade) {
  return `${trade.inputAmount.toExact()} ${trade.inputAmount.currency.symbol} for ${trade.outputAmount.toExact()} ${trade.outputAmount.currency.symbol}`;
}

module.exports = { fromReadableAmount, toReadableAmount, displayTrade };
