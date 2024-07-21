require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");

module.exports = {
  solidity: "0.8.26",
  gasReporter: {
    enabled: true,
    currency: 'EUR',
    gasPrice: 50,
  },
  // other configurations
};
