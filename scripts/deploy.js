// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {

  beneficiaryA = "0x";
  beneficiaryB = "0x";

  const RandomRewarder = await hre.ethers.getContractFactory("RandomRewarder");
  const randomRewarder = await RandomRewarder.deploy(beneficiaryA, beneficiaryB);

  await lock.deployed();

  console.log(
    `Random Rewarder deployed to ${randomRewarder.address}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
