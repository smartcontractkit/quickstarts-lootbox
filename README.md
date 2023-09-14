# Chainlink Solution Accelerator: Lootbox

The lootbox is a utility contract that allow users to open it to receive a random reward.

It supports [ERC20](https://eips.ethereum.org/EIPS/eip-20), [ERC721](https://eips.ethereum.org/EIPS/eip-721), and [ERC1155](https://eips.ethereum.org/EIPS/eip-1155) tokens as rewards. The rewards are distributed from a pool of tokens that are trasferred to the contract on deploy.

The lootbox contract uses [Chainlink VRF](https://docs.chain.link/docs/get-a-random-number/) to generate a random number that is used to determine the reward.

## Table of Contents

- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Setup](#setup)
  - [Hardhat Project](#hardhat-project)
  - [Contract Params](#contract-params)
  - [Reward Tokens](#reward-tokens)
  - [Whitelist](#whitelist)
- [Test](#test)
- [Deploy](#deploy)
- [Open](#open)
  - [Private](#private)
  - [Public](#public)
- [Randomness](#randomness)
- [Claim Rewards](#claim-rewards)
- [Withdraw Funds](#withdraw-funds)
- [Configuration](#configuration)
- [Format](#format)
- [Lint](#lint)

## Requirements

- [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
  - You'll know you did it right if you can run `git --version` and you see a response like `git version x.x.x`
- [Nodejs](https://nodejs.org/en/) 16.0.0 or higher
  - You'll know you've installed nodejs right if you can run:
    - `node --version` and get an output like: `v16.x.x`

## Getting Started

Clone the repo and install all dependencies.

```bash
git clone https://github.com/smartcontractkit/quickstarts-lootbox.git

cd quickstarts-lootbox

npm install
```

Alternatively, you can use [yarn](https://yarnpkg.com/) to install dependencies.

```bash
yarn install
```

## Setup

Copy the `.env.example` file to `.env` and fill in the values.

```bash
cp .env.example .env
```

### Hardhat Project

| Parameter         | Description                                                 | Example                                     |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `NETWORK_RPC_URL` | The RPC URL for the network you want to deploy to.          | `https://sepolia.infura.io/v3/your-api-key` |
| `PRIVATE_KEY`     | The private key of the account you want to deploy from.     | `0xabc123abc123abc123abc123abc123...`       |
| `ETHERSCAN_API`   | The API key for Etherscan needed for contract verification. | `ABC123ABC123ABC123ABC123ABC123ABC1`        |

### Contract Params

| Parameter                             | Description                                                                                                               | Example      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `LOOTBOX_FEE_PER_OPEN`                | The fee per open in ETH                                                                                                   | `0.1`        |
| `LOOTBOX_AMOUNT_DISTRIBUTED_PER_OPEN` | The amount of reward units distributed per open                                                                           | `1`          |
| `LOOTBOX_OPEN_START_TIMESTAMP`        | The start timestamp in UNIX time for the public open. Leave blank to start immediately.                                   | `1630000000` |
| `VRF_SUBSCRIPTION_ID`                 | A funded Chainlink VRF subscription ID. If you leave this blank, a new subscription will be created and funded on deploy. | `123`        |

### Reward Tokens

There's an example configuration file in `scripts/data/tokens.json` which includes a list of all suppoted token types:

- ERC20

```json
{
  "tokenType": "ERC20",
  "assetContract": "0x0000000000000000000000000000000000000001",
  "totalAmount": "100000000000000000000",
  "amountPerUnit": "10000000"
}
```

- ERC721

```json
{
  "tokenType": "ERC721",
  "assetContract": "0x0000000000000000000000000000000000000002",
  "tokenIds": ["1", "2"]
}
```

- ERC1155

```json
{
  "tokenType": "ERC1155",
  "assetContract": "0x0000000000000000000000000000000000000003",
  "tokenId": "0",
  "totalAmount": "100",
  "amountPerUnit": "10"
}
```

The amounts per unit are used to calculate the lootbox supply of rewards. For example, if you want to distribute 100 tokens of a specific ERC20 token, you would set the `totalAmount` to `100000000000000000000` and the `amountPerUnit` to `1000000000000000000`. This would result in a lootbox supply of 100 units.

Add all the tokens you want to distribute as rewards to the array in the list of tokens by following the format above.

Note: The deployer account must own all the tokens you want to distribute as rewards.

### Whitelist

The merkle tree for the private openning stage is generated from the address list in `scripts/data/whitelist.json` file. Edit the file and add all the addresses you want to list.

Leave the file empty if you don't want to do a private mint and the contract will be initialized in public openning mode.

## Test

To run the unit tests, run the following command.

```bash
npm run test
```

If you want to see gas usage, run the following command.

```bash
REPORT_GAS=true npm run test
```

For coverage reports, run the following command.

```bash
npm run coverage
```

## Deploy

Besides deploying the contract, the deploy script will also:

1. Approve each token configured in `scripts/data/tokens.json` for the deployed contract address.

   Note: This is a mandatory step because the contract must store the tokens in its own balance. So make sure the deployer account owns all the tokens you want to distribute as rewards.

2. Generate a merkle tree for the whitelist.

3. Create and fund a VRF subscription if one is not provided.

   Note: Make sure the deployer account has enough LINK to fund the subscription. The initial funding amount is configured in `network-config.js`. For testnets, you can use the [LINK faucet](https://docs.chain.link/docs/link-token-contracts/#faucets).

4. Add the deployed contract address as a consumer to the VRF subscription.

   Note: If you provided a subscription ID, make sure the deployer account is the owner of the subscription. Otherwise, comment out the `addVrfConsumer` function in the deploy script and add the contract address manually.

5. Verify the contract on Etherscan. If you want to skip this step, comment out the `verify` function in the deploy script.

To run the deploy script, run the following command and replace `<network>` with the network you want to deploy to.

```bash
npx hardhat run scripts/deploy.js --network <network>
```

Note: The network must be configured in `hardhat.config.js`.

## Open

Once the contract is deployed and the start timestamp is reached, users can start opening the lootbox. The amount of rewards they receive depends on the amount of units they open by specifying the `amountToOpen` parameter and paying the corresponding fee.

There are two modes for opening the lootbox which can be toggled by the owner account.

### Private

In this mode, the lootbox is only open to whitelisted addresses by calling the `privateOpen` function and providing merkle proof for the address. To generate it, see [merkletreejs](https://github.com/merkletreejs/merkletreejs).

The whitelist is set on contract deployment and can be changed by calling the `setWhitelistRoot` function from the owner account. The private mode can be enabled or disabled at any time by calling the `setPrivateOpen` function from the owner account.

### Public

When the private mode is disabled, anyone can open the lootbox by calling the `publicOpen` function. It will do the same thing as the `privateOpen` function but without the merkle proof.

## Randomness

The contract uses [Chainlink VRF](https://vrf.chain.link) to generate randomness which is used to determine the rewards the user receives.

Because the randomness is generated off-chain, the contract will not be able to transfer the rewards immediately. Instead, it will store the request and once the randomness is received, the user or anyone else can call the `claimRewards` function to transfer the rewards to the user.

The lootbox creator can also call the `claimRewards` function and improve the user experience by transferring the rewards to the user immediately. This can be further automated by using [Chainlink Automation](https://automation.chain.link/).

## Claim Rewards

The rewards for an open request can be claimed by calling the `claimRewards` function and passing the opener address as the parameter. This will transfer the rewards to the opener address.

The claim function can only be called after the randomness is fulfilled. It can be checked by calling the `canClaimRewards` function and passing the opener address as the parameter.

Note: One address can only have one open request at a time. If you try to open the lootbox again before the previous request is fulfilled, the transaction will revert with `PendingOpenRequest` error.

## Withdraw Funds

At any time, the owner can withdraw funds from the collected fees by calling the `withdraw` function. By doing so the contract balance will be transferred to the owner account.

## Configuration

Upon deployment, some of the contract parameters can be changed by calling the following functions from the owner account.

| Function           | Description                            | Parameters           |
| ------------------ | -------------------------------------- | -------------------- |
| `setWhitelistRoot` | Set new merkle root for the whitelist. | `whitelistRoot`      |
| `setPrivateOpen`   | Enable/disable public openning mode.   | `privateOpenEnabled` |

## Format

For formatting, we use [prettier](https://prettier.io/).

To check the formatting, run the following command.

```bash
npm run prettier:check
```

To fix the formatting, run the following command.

```bash
npm run prettier:write
```

## Lint

For linting, we use [eslint](https://eslint.org/).

To run the linter, run the following command.

```bash
npm run lint
```

## References

- [Chainlink VRF](https://docs.chain.link/docs/chainlink-vrf)
- [OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/)
- [Hardhat](https://hardhat.org/getting-started/)

> :warning: **Disclaimer**: "This tutorial represents an educational example to use a Chainlink system, product, or service and is provided to demonstrate how to interact with Chainlink’s systems, products, and services to integrate them into your own. This template is provided “AS IS” and “AS AVAILABLE” without warranties of any kind, it has not been audited, and it may be missing key checks or error handling to make the usage of the system, product or service more clear. Do not use the code in this example in a production environment without completing your own audits and application of best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs that are generated due to errors in code."
