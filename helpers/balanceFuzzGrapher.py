import json
import matplotlib.pyplot as plt
import os

# Ensure the script is executed in the correct directory
script_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(script_dir, 'balanceData.json')

# Load the balance data from the JSON file
with open(json_path, 'r') as file:
    balances_over_time = json.load(file)

rounds = [entry["round"] for entry in balances_over_time]
contract_balances = [float(entry["contractBalance"]) for entry in balances_over_time]
total_balances = [float(entry["totalBalance"]) for entry in balances_over_time]
address_balances = [entry["addressBalances"] for entry in balances_over_time]
cumulative_rewards_paid = [float(entry["cumulativeRewardsPaid"]) for entry in balances_over_time]
rewards_paid_this_round = [float(entry["rewardsPaidThisRound"]) for entry in balances_over_time]

# Plot individual address balances
plt.figure(figsize=(12, 6))
for idx in range(len(address_balances[0])):
    individual_balances = [entry[idx] for entry in address_balances]
    plt.plot(rounds, individual_balances, label=f"Address {idx+1}", linewidth=1)

# Plot contract balance over time
plt.plot(rounds, contract_balances, label="Contract Balance", color='blue', linewidth=2)

# Plot total balance over time
# plt.plot(rounds, total_balances, label="Total Balance", color='green', linewidth=2)

# Plot average address balance over time
average_address_balances = [sum(entry) / len(entry) for entry in address_balances]
plt.plot(rounds, average_address_balances, label="Average Address Balance", linestyle='--', color='yellow', linewidth=1)

# Plot cumulative rewards paid over time
# plt.plot(rounds, cumulative_rewards_paid, label="Cumulative Rewards Paid", linestyle='-.', color='red', linewidth=2)

# Plot bars where the contract loses funds to rewards
for i in range(len(rewards_paid_this_round)):
    if rewards_paid_this_round[i] > 0:
        plt.bar(rounds[i], rewards_paid_this_round[i], width=0.4, color='purple', alpha=0.5, label='Value of Reward Paid' if i == 0 else "")

plt.xlabel("Round")
plt.ylabel("Balance (ETH)")
# plt.yscale('log')
plt.title("Balances Over Time")
plt.legend()

# Add grid lines without grid marks
plt.grid(True, which="both", linestyle='--', linewidth=0.5, color='gray')

# Remove minor ticks (grid marks)
plt.minorticks_off()

plt.show()
