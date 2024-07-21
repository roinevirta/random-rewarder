const { expect } = require("chai");
const { ethers } = require("hardhat");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");
const fs = require('fs');
const path = require('path'); // Require the path module

describe("RandomRewarder", function () {
  let RandomRewarder;
  let randomRewarder;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let beneficiaryA;
  let beneficiaryB;

  const LOOKAHEAD_PERIOD = 132;
  const SPAM_THRESHOLD = ethers.utils.parseUnits("10000", "gwei");

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, beneficiaryA, beneficiaryB] = await ethers.getSigners();

    const RandomRewarder = await ethers.getContractFactory("RandomRewarder");
    randomRewarder = await RandomRewarder.deploy(beneficiaryA.address, beneficiaryB.address);
    await randomRewarder.deployed();
  });

  it("Should deploy correctly", async function () {
    expect(await randomRewarder.beneficiaryA()).to.equal(beneficiaryA.address);
    expect(await randomRewarder.beneficiaryB()).to.equal(beneficiaryB.address);
  });

  it("Should accept valid transactions and spam", async function () {
    // Transaction below spam threshold
    await expect(() => addr1.sendTransaction({
      to: randomRewarder.address,
      value: ethers.utils.parseUnits("0.00001", "ether")
    })).to.changeEtherBalance(randomRewarder, ethers.utils.parseUnits("0.00001", "ether"));

    // Valid transaction
    await expect(() => addr1.sendTransaction({
      to: randomRewarder.address,
      value: ethers.utils.parseUnits("1", "ether")
    })).to.changeEtherBalance(randomRewarder, ethers.utils.parseUnits("1", "ether"));
  });

  it("Should process transactions and select a winner", async function () {
    // Send multiple transactions
    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("1", "ether") });
    await addr2.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("2", "ether") });

    const oldBalance1 = await ethers.provider.getBalance(addr1.address);
    const oldBalance2 = await ethers.provider.getBalance(addr2.address);

    // Advance the block number and timestamp to trigger processing
    await mine(LOOKAHEAD_PERIOD);

    // Process transactions
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    // Process the next period
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0.2", "ether") });
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0.2", "ether") });
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    const newBalance1 = await ethers.provider.getBalance(addr1.address);
    const newBalance2 = await ethers.provider.getBalance(addr2.address);

    // Check balances
    const contractBalance = await ethers.provider.getBalance(randomRewarder.address);
    expect(contractBalance).to.be.at.least(ethers.utils.parseUnits("0.2", "ether"));

    // Ensure one of the addresses received the reward
    expect(newBalance1.gt(oldBalance1) || newBalance2.gt(oldBalance2)).to.be.true;
  });


  it("Should change the beneficiary", async function () {
    await randomRewarder.connect(beneficiaryA).changeBeneficiary(owner.address);
    expect(await randomRewarder.beneficiaryA()).to.equal(owner.address);

    await randomRewarder.connect(beneficiaryB).changeBeneficiary(addr1.address);
    expect(await randomRewarder.beneficiaryB()).to.equal(addr1.address);
  });

  it("Should change the beneficiary even if initialised to the same address", async function () {
    const RandomRewarder = await ethers.getContractFactory("RandomRewarder");
    randomRewarder = await RandomRewarder.deploy(addr1.address, addr1.address);
    expect(await randomRewarder.beneficiaryA()).to.equal(addr1.address);
    expect(await randomRewarder.beneficiaryB()).to.equal(addr1.address);

    await randomRewarder.connect(addr1).changeBeneficiary(beneficiaryA.address);
    expect(await randomRewarder.beneficiaryA()).to.equal(beneficiaryA.address);
    expect(await randomRewarder.beneficiaryB()).to.equal(addr1.address);

    await randomRewarder.connect(addr1).changeBeneficiary(beneficiaryB.address);
    expect(await randomRewarder.beneficiaryA()).to.equal(beneficiaryA.address);
    expect(await randomRewarder.beneficiaryB()).to.equal(beneficiaryB.address);
  });

  it("Does not allow unauthorised beneficiary changes", async function () {
    expect(await randomRewarder.connect(addr1).changeBeneficiary(owner.address)).to.be.reverted;
    expect(await randomRewarder.beneficiaryA()).to.equal(beneficiaryA.address);
  });

  it("Should skip reward if contract balance is too low", async function () {
    // Send a small amount of ETH
    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("0.5", "ether") });

    // Advance the block number and timestamp to trigger processing
    await mine(LOOKAHEAD_PERIOD);

    // Process transactions
    await addr3.sendTransaction({ gasLimit: 100000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    // Ensure reward was skipped
    const contractBalance = await ethers.provider.getBalance(randomRewarder.address);
    expect(contractBalance).to.equal(ethers.utils.parseUnits("0.5", "ether"));
  });

  /* TODO: REFORMULATE TEST WITH PRIVATE CUMUMULATIVE WEIGHT A VISIBILITY
  it("Should ensure spam doesn't get counted", async function () {
    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("0.00001", "ether") });
    await addr2.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("2", "ether") });

    // Spam should not affect the cumulative weight
    expect(await randomRewarder.cumulativeWeightA()).to.equal(ethers.utils.parseUnits("2", "ether"));
  }); */

  it("Should ensure exactly 90% of its funds are paid out", async function () {
    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("1", "ether") });
    await addr2.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("2", "ether") });

    // Advance the block number and timestamp to trigger processing
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    const initialBalance1 = await ethers.provider.getBalance(addr1.address);
    const initialBalance2 = await ethers.provider.getBalance(addr2.address);

    // Process the next period
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0.2", "ether") });
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0.2", "ether") });
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    const finalBalance1 = await ethers.provider.getBalance(addr1.address);
    const finalBalance2 = await ethers.provider.getBalance(addr2.address);

    const payout1 = finalBalance1.sub(initialBalance1);
    const payout2 = finalBalance2.sub(initialBalance2);
    const expectedPayout = ethers.utils.parseUnits("2.7", "ether");

    expect(payout1.eq(expectedPayout) || payout2.eq(expectedPayout)).to.be.true;
  });

  it("Should pay beneficiaries correctly", async function () {
    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("1", "ether") });
    await addr2.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("2", "ether") });

    // Advance the block number and timestamp to trigger processing
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    const initialBalanceA = await ethers.provider.getBalance(beneficiaryA.address);
    const initialBalanceB = await ethers.provider.getBalance(beneficiaryB.address);

    // Process the next period
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0.2", "ether") });
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0.2", "ether") });
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    const finalBalanceA = await ethers.provider.getBalance(beneficiaryA.address);
    const finalBalanceB = await ethers.provider.getBalance(beneficiaryB.address);

    expect(finalBalanceA).to.equal(initialBalanceA.add(ethers.utils.parseUnits("0.135", "ether"))); // 5% of 2.7 ETH
    expect(finalBalanceB).to.equal(initialBalanceB.add(ethers.utils.parseUnits("0.135", "ether"))); // 5% of 2.7 ETH
  });

  it("Should emit the rewardWinner event", async function () {
    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("1", "ether") });
    await addr2.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("2", "ether") });

    // Advance the block number and timestamp to trigger processing
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    // Process the next period
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0.2", "ether") });
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0.2", "ether") });
    await mine(LOOKAHEAD_PERIOD);

    await expect(addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") }))
      .to.emit(randomRewarder, 'rewardWinner')
      .withArgs(addr2.address, ethers.utils.parseUnits("2.7", "ether")); // Assuming addr2 wins
  });

  it("Should not emit rewardWinner event if the program itself wins", async function () {
    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("50", "ether") });
    await addr2.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("50", "ether") });
    await addr3.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("50", "ether") });

    // Advance the block number and timestamp to trigger processing
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("40", "ether") });
    await addr2.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("40", "ether") });
    await addr3.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("40", "ether") });

    // Advance the block number and timestamp to trigger processing
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    await addr1.sendTransaction({ to: randomRewarder.address, value: SPAM_THRESHOLD });
    await addr2.sendTransaction({ to: randomRewarder.address, value: SPAM_THRESHOLD });

    // Advance the block number and timestamp to trigger processing
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    // Send a transaction to process
    await expect(addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") }))
      .not.to.emit(randomRewarder, 'rewardWinner');
  });

  it("Should allow an address to win twice", async function () {
    // Initial funding for the test address
    await addr1.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("1", "ether") });
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    // Helper function to send transactions and mine
    async function sendTransactionAndMine(addr, value) {
      await addr.sendTransaction({ to: randomRewarder.address, value });
      await mine(1);
    }

    // Send multiple transactions and process them
    for (let i = 0; i < 10; i++) {
      await sendTransactionAndMine(addr1, ethers.utils.parseUnits("1", "ether"));
    }

    // Capture the balance before the first win
    const balanceBeforeFirstWin = await ethers.provider.getBalance(addr1.address);

    // Advance the block number and process transactions
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    // Capture the balance after the first win
    const balanceAfterFirstWin = await ethers.provider.getBalance(addr1.address);

    // Check if addr1 won the first round
    const wonFirstRound = balanceAfterFirstWin.gt(balanceBeforeFirstWin);

    // Send more transactions from the same address and process them
    for (let i = 0; i < 10; i++) {
      await sendTransactionAndMine(addr1, ethers.utils.parseUnits("1", "ether"));
    }

    // Capture the balance before the second win
    const balanceBeforeSecondWin = await ethers.provider.getBalance(addr1.address);

    // Advance the block number and process transactions
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    // Capture the balance after the second win
    const balanceAfterSecondWin = await ethers.provider.getBalance(addr1.address);

    // Check if addr1 won the second round
    const wonSecondRound = balanceAfterSecondWin.gt(balanceBeforeSecondWin);

    // Send more transactions from the same address and process them
    for (let i = 0; i < 10; i++) {
      await sendTransactionAndMine(addr1, ethers.utils.parseUnits("1", "ether"));
    }

    // Capture the balance before the third win
    const balanceBeforeThirdWin = await ethers.provider.getBalance(addr1.address);

    // Advance the block number and process transactions
    await mine(LOOKAHEAD_PERIOD);
    await addr3.sendTransaction({ gasLimit: 200000, to: randomRewarder.address, value: ethers.utils.parseUnits("0", "ether") });

    // Capture the balance after the third win
    const balanceAfterThirdWin = await ethers.provider.getBalance(addr1.address);

    // Check if addr1 won the third round
    const wonThirdRound = balanceAfterThirdWin.gt(balanceBeforeThirdWin);

    // Ensure the address won at least twice
    expect((wonFirstRound && wonSecondRound) || (wonFirstRound && wonThirdRound) || (wonSecondRound && wonThirdRound)).to.be.true;
  });

  it("Balance fuzzing & visualisation", async function () {
    const uniqueAddresses = [];

    const COUNT_ADDRESSES = 2;
    const COUNT_PERIODS = 250;
    
    for (let i = 0; i < COUNT_ADDRESSES; i++) {
      const newAddress = ethers.Wallet.createRandom().connect(ethers.provider);
      uniqueAddresses.push(newAddress);
      await owner.sendTransaction({ to: newAddress.address, value: ethers.utils.parseUnits("100", "ether") });
    }

    const balancesOverTime = [];
    let cumulativeRewardsPaid = 0;

    for (let i = 0; i < COUNT_PERIODS; i++) {
      let rewardsPaidThisRound = 0;

      for (const addr of uniqueAddresses) {
        const randomAmount = ethers.utils.parseUnits((Math.random() * 0.1).toFixed(8), "ether");
        await addr.sendTransaction({ to: randomRewarder.address, value: randomAmount });
      }

      await mine(1);

      // Capture balances and calculate rewards
      const addressBalances = await Promise.all(
        uniqueAddresses.map(async (addr) => parseFloat(ethers.utils.formatUnits(await ethers.provider.getBalance(addr.address), "ether")).toFixed(3))
      );

      const contractBalance = parseFloat(ethers.utils.formatUnits(await ethers.provider.getBalance(randomRewarder.address), "ether")).toFixed(3);

      const totalBalance = addressBalances.reduce((sum, balance) => sum + parseFloat(balance), 0) + parseFloat(contractBalance);

      // Calculate rewards paid out (assuming rewards are half the contract balance at each payout)
      rewardsPaidThisRound = contractBalance * 0.5;
      cumulativeRewardsPaid += rewardsPaidThisRound;

      balancesOverTime.push({
        round: i + 1,
        addressBalances: addressBalances.map(balance => parseFloat(balance)),
        contractBalance: parseFloat(contractBalance),
        totalBalance: parseFloat(totalBalance.toFixed(3)),
        cumulativeRewardsPaid: parseFloat(cumulativeRewardsPaid.toFixed(3)),
        rewardsPaidThisRound: parseFloat(rewardsPaidThisRound.toFixed(3))
      });
    }

    const outputPath = path.join(__dirname, '../helpers', 'balanceData.json');
    fs.writeFileSync(outputPath, JSON.stringify(balancesOverTime, null, 2));
  });

   it("Gas reporting", async function () {
    const uniqueAddresses = [];

    PARTICIPANTS_PER_PERIOD = 200;
    PERIODS = 3;

    
    for (let j = 0; j < PARTICIPANTS_PER_PERIOD; j++) {
      const newAddress = ethers.Wallet.createRandom().connect(ethers.provider);
      uniqueAddresses.push(newAddress);
      await owner.sendTransaction({ to: newAddress.address, value: ethers.utils.parseUnits("1", "ether") });
    }
    
    const gasUsed = [];
    for (let i = 0; i < PERIODS; i++) {
      for (const addr of uniqueAddresses) {
        const tx = await addr.sendTransaction({ to: randomRewarder.address, value: ethers.utils.parseUnits("0.01", "ether") });
        const receipt = await tx.wait();
        gasUsed.push(receipt.gasUsed.toNumber());
      }
      await mine(LOOKAHEAD_PERIOD);
    }

    // Calculate median
    const sortedGasUsed = [...gasUsed].sort((a, b) => a - b);
    const middle = Math.floor(sortedGasUsed.length / 2);
    const median = sortedGasUsed.length % 2 === 0 
      ? (sortedGasUsed[middle - 1] + sortedGasUsed[middle]) / 2 
      : sortedGasUsed[middle];

    // Calculate average
    const average = gasUsed.reduce((a, b) => a + b, 0) / gasUsed.length;

    // Get top 5 gas spenders
    const top5GasSpenders = [...gasUsed].sort((a, b) => b - a).slice(0, 5);

    console.log("    Receive function gas report");
    console.log("       Median gas used by receive function:", median);
    console.log("       Median gas used by receive function:", median);
    console.log("       Average gas used by receive function:", average);
    console.log("       Top 5 gas spenders by receive function:", top5GasSpenders);
  });

});