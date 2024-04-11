const { ethers } = require('ethers');

const READABLE_FORM_LEN = 4;

function fromReadableAmount(amount, decimals) {
  return ethers.utils.parseUnits(amount.toString(), decimals);
}

function toReadableAmount(rawAmount, decimals) {
  return ethers.utils
    .formatUnits(rawAmount, decimals)
    .slice(0, READABLE_FORM_LEN);
}

module.exports = { fromReadableAmount, toReadableAmount };
