// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

/// @title Random Rewarder
/// @author J.J. Roinevirta
/// @notice Sending ETH to this contract gives you a chance to get part of the ETH accumulated in the current period 
/// @dev Please notice minimum tx gas and spam thresholds, do not include msg.data
/// @custom:experimental This is an experimental contract.
contract RandomRewarder {
    bool private useA = true;
    bool private rewardSkip = false;
    bool private firstRun = true;

    uint128 private txCountA;
    uint128 private txCountB;

    address public beneficiaryA;
    address public beneficiaryB;

    uint256 private targetSlot;
    
    struct Transaction {
        address sender;
        uint256 cumulativeWeight;
    }

    mapping(uint256 => Transaction) private txA;
    mapping(uint256 => Transaction) private txB;
    
    uint256 private cumWA;
    uint256 private cumWB;

    // Deployment specific constants
    uint256 private constant LOOKAHEAD_PERIOD = 132;        // Slot count
                                                            // Minimum (for safety) is 4 epochs * 32 slots + 4 extra slots as per EIP-4399
                                                            // N.B.! May be different for chains other than mainnet
                                                            // May be practical to set higher to ensure rewards for each period

    uint256 private constant MINIMUM_REWARD = 5 ether / 10;  // 0.5 ETH (approx. 1500€)
    uint256 private constant SPAM_THRESHOLD = 10000 gwei;    // Lower for low cost chains

    event rewardWinner(address indexed winner, uint256 indexed amount);     // Emitted at reward payout

    constructor(address _beneficiaryA, address _beneficiaryB) {
        beneficiaryA = _beneficiaryA;
        beneficiaryB = _beneficiaryB;
        setTargetSlot_fVp();
    }

    /// @notice Transactions under the spam threshold do not participate
    receive() external payable {
        if (msg.value > SPAM_THRESHOLD) {
            // Accumulate the transaction
            if (useA) {
                uint256 newCumulativeWeight = cumWA + msg.value;
                txA[txCountA] = Transaction({
                    sender: msg.sender,
                    cumulativeWeight: newCumulativeWeight
                });
                cumWA = newCumulativeWeight;
                ++txCountA;
            } else {
                uint256 newCumulativeWeight = cumWB + msg.value;
                txB[txCountB] = Transaction({
                    sender: msg.sender,
                    cumulativeWeight: newCumulativeWeight
                });
                cumWB = newCumulativeWeight;
                ++txCountB;
            }
        } 

        // If the current slot is the target slot and transactions have not been processed yet, process the waiting transactions
        if (block.number >= targetSlot) {
            // But only if there are real transactions in the transaction set
            if ((useA && txCountB > 1) || (!useA && txCountA > 1)) {
                processTransactions_3gq();
                setTargetSlot_fVp();
                
                if (!rewardSkip) {
                    // Reset the spent transaction data
                    if (useA) {
                        uint256 excessBalance = (address(this).balance - cumWA);  // excessBalance are the funds rolled over to the next period
                        txB[0] = Transaction({
                            sender: address(this),
                            cumulativeWeight: excessBalance
                        });
                        txCountB = 1;
                        cumWB = excessBalance;
                    } else {
                        uint256 excessBalance = (address(this).balance - cumWB);
                        txA[0] = Transaction({
                            sender: address(this),
                            cumulativeWeight: excessBalance
                        });
                        txCountA = 1;
                        cumWA = excessBalance;
                    }

                    // Toggle the transaction set to be used
                    useA = !useA;
                } else {
                    rewardSkip = false; // Reset until next evaluation period
                }  
            } else {
                if (firstRun && txCountA > 1) {
                    useA = !useA;
                    setTargetSlot_fVp();
                    delete firstRun;    // sets to false
                }
            }      
        }
    }

    function setTargetSlot_fVp() internal {
        targetSlot = block.number + LOOKAHEAD_PERIOD; // Slot in which current transaction accumulation period ends
    }

    function processTransactions_3gq() internal {
        uint256 totalWeight = useA ? cumWB : cumWA;

        // If there are not enough rewards, keep accumulating by skipping reward payout
        if (totalWeight < MINIMUM_REWARD * 2) {
            rewardSkip = true;
            return;
        }
        
        Transaction storage winnerTx = selectWinner_rlO(totalWeight);
        uint256 rewardAmount = totalWeight * 9 / 10;

        // Only pay the winner and beneficiaries if the winner is not this address
        if (winnerTx.sender != address(this)) {
            // Send reward to the winner
            (bool sent, ) = winnerTx.sender.call{value: rewardAmount}("");
            require(sent, "FR");

            // Send rewards to the beneficiaries
            uint256 beneficiaryRewardAmount = rewardAmount / 20; // 5% of reward amount to each beneficiary
            (bool sentA, ) = beneficiaryA.call{value: beneficiaryRewardAmount}("");
            require(sentA, "FBA");
            (bool sentB, ) = beneficiaryB.call{value: beneficiaryRewardAmount}("");
            require(sentB, "FBB");

            emit rewardWinner(winnerTx.sender, rewardAmount);
        }
    }

    function selectWinner_rlO(uint256 totalWeight) internal view returns (Transaction storage) {
        uint256 winningWeight = block.prevrandao % totalWeight;
        if (useA) {
            return binarySearch_8Er(txB, txCountB, winningWeight);
        } else {
            return binarySearch_8Er(txA, txCountA, winningWeight);
        }
    }

    function binarySearch_8Er(mapping(uint256 => Transaction) storage transactions, uint128 count, uint256 target) internal view returns (Transaction storage) {
        uint256 low;
        uint256 high = count - 1;
        while (low < high) {
            uint256 mid = (high & low) + (high ^ low) / 2;     // Mid strictly less than high
            if (transactions[mid].cumulativeWeight <= target) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return transactions[low];
    }

    /// @notice Whether the accumulation period can be advanced by processing
    /// @dev Does not work during the firstRun
    /// @return bool true if accumulation period can be advanced
    function awaitingProcessing() external view returns (bool) {
        return (block.number >= targetSlot && (useA && txCountB > 1 || !useA && txCountA > 1));
    }

    /// @notice The value of rewards available from the current period
    function currentRewards() external view returns (uint256) {
        return useA ? cumWA/2 : cumWB/2;
    }

    function changeBeneficiary(address _newBeneficiary) external {
        if (msg.sender == beneficiaryA) {
            beneficiaryA = _newBeneficiary;
        } else {
            if (msg.sender == beneficiaryB) {
                beneficiaryB = _newBeneficiary;
            }
        }
    }
}