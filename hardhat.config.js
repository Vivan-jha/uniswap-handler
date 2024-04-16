/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks:{
    hardhat:{
      forking:{
        enabled:true,
        url:'https://eth-mainnet.g.alchemy.com/v2/uQMzFFe-s-LHk8kRSgBJ4-FCbr7o7DNm'
      },
      chainId:1
    }
    
  }
};
