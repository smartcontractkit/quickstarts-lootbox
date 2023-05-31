import { chainlink, ethers, network, run } from 'hardhat'
import { BigNumber } from 'ethers'
import { MerkleTree } from 'merkletreejs'
import keccak256 from 'keccak256'
import { networkConfig } from '../network-config'
import { Lootbox } from '../typechain-types'
import whitelist from './data/whitelist.json'
import tokens from './data/tokens.json'

enum TokenType {
  ERC20 = 0,
  ERC721 = 1,
  ERC1155 = 2,
}

function getTokenTypeId(tokenType: string) {
  switch (tokenType) {
    case 'ERC20':
      return TokenType.ERC20
    case 'ERC721':
      return TokenType.ERC721
    case 'ERC1155':
      return TokenType.ERC1155
    default:
      throw new Error(`Invalid token type ${tokenType}`)
  }
}

async function setTokenAllowance(
  token: Lootbox.TokenStruct,
  toAddress: string,
) {
  switch (token.tokenType) {
    case TokenType.ERC20: {
      const erc20 = await ethers.getContractAt(
        'IERC20',
        token.assetContract.toString(),
      )
      await erc20.approve(toAddress, token.totalAmount)
      console.log(
        'Approved ERC20',
        token.assetContract.toString(),
        'to',
        toAddress,
        'for',
        token.totalAmount.toString(),
        'tokens',
      )
      break
    }
    case TokenType.ERC721: {
      const erc721 = await ethers.getContractAt(
        'IERC721',
        token.assetContract.toString(),
      )
      await erc721.approve(toAddress, token.tokenId)
      console.log(
        'Approved ERC721',
        token.assetContract.toString(),
        'to',
        toAddress,
        'for token',
        token.tokenId.toString(),
      )
      break
    }
    case TokenType.ERC1155: {
      const erc1155 = await ethers.getContractAt(
        'IERC1155',
        token.assetContract.toString(),
      )
      await erc1155.setApprovalForAll(toAddress, true)
      console.log(
        'Approved ERC1155',
        token.assetContract.toString(),
        'to',
        toAddress,
      )
      break
    }
    default:
      throw new Error(`Invalid token type ${token.tokenType}`)
  }
}

const feePerOpen = process.env.LOOTBOX_FEE_PER_OPEN
const amountDistributedPerOpen = process.env.LOOTBOX_AMOUNT_DISTRIBUTED_PER_OPEN
const openStartTimestamp = process.env.LOOTBOX_OPEN_START_TIMESTAMP
const existingSubscriptionId = process.env.VRF_SUBSCRIPTION_ID

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  if (!feePerOpen || !amountDistributedPerOpen) {
    throw new Error('Missing required env vars!')
  }

  // Map tokens data
  if (!tokens || !tokens.length) {
    throw new Error('Missing tokens data!')
  }

  const transformedTokens = tokens
    .map((token) => {
      if (!token.tokenType) {
        throw new Error('Missing token type!')
      }
      if (!token.assetContract) {
        throw new Error('Missing asset contract address!')
      }
      if (token.tokenType === 'ERC721') {
        if (!token.tokenIds || !token.tokenIds.length) {
          throw new Error('Missing token IDs for ERC721!')
        }
        return token.tokenIds.map((tokenId) => ({
          tokenType: token.tokenType,
          assetContract: token.assetContract,
          tokenId,
          totalAmount: '1',
          amountPerUnit: '1',
        }))
      } else {
        if (!token.tokenId && token.tokenType === 'ERC1155') {
          throw new Error('Missing token ID for ERC1155 token!')
        }
        if (!token.totalAmount) {
          throw new Error('Missing total amount!')
        }
        return {
          tokenType: token.tokenType,
          assetContract: token.assetContract,
          tokenId: token.tokenId || '0',
          totalAmount: token.totalAmount,
          amountPerUnit: token.amountPerUnit,
        }
      }
    })
    .flat()

  const lootboxTokens: Lootbox.TokenStruct[] = transformedTokens.map(
    (token) => ({
      tokenType: getTokenTypeId(token.tokenType),
      assetContract: token.assetContract,
      tokenId: token.tokenId,
      totalAmount: token.totalAmount,
    }),
  )
  const perUnitAmounts = transformedTokens.map((token) => token.amountPerUnit)

  // Create and fund a VRF subscription if existing one is not configured
  const { chainId } = network.config
  if (!chainId) {
    throw new Error('Missing network configuration!')
  }
  const { vrfCoordinatorV2, keyHash, linkToken, fundAmount } =
    networkConfig[chainId]

  let subscriptionId: BigNumber
  if (existingSubscriptionId) {
    subscriptionId = BigNumber.from(existingSubscriptionId)
  } else {
    const createSubscriptionResponse = await chainlink.createVrfSubscription(
      vrfCoordinatorV2,
    )
    subscriptionId = createSubscriptionResponse.subscriptionId
    console.log('Created VRF subscription with ID', subscriptionId.toString())

    // Fund the newly created subscription
    const fundAmountInJuels = BigNumber.from(fundAmount)
    await chainlink.fundVrfSubscription(
      vrfCoordinatorV2,
      linkToken,
      fundAmountInJuels,
      subscriptionId,
    )
    console.log(
      `Subscription funded with ${ethers.utils.formatEther(fundAmount)} LINK`,
    )
  }

  // Generate whitelist root
  let whitelistRoot = ethers.constants.HashZero
  if (whitelist && whitelist.length) {
    const merkleTree = new MerkleTree(whitelist, keccak256, {
      sortPairs: true,
      hashLeaves: true,
    })
    whitelistRoot = merkleTree.getHexRoot()
    console.log('Generated whitelist root', whitelistRoot)
  }

  // Precompute Lootbox contract address
  const [deployer] = await ethers.getSigners()
  const lootboxAddress = ethers.utils.getContractAddress({
    from: deployer.address,
    nonce:
      (await ethers.provider.getTransactionCount(deployer.address)) +
      lootboxTokens.length,
  })

  // Set token allowances for Lootbox contract
  for (const token of lootboxTokens) {
    await setTokenAllowance(token, lootboxAddress)
  }

  // Deploy Lootbox contract
  const feeInWei = ethers.utils.parseEther(feePerOpen)

  const openStartTimestampInUnix = openStartTimestamp
    ? parseInt(openStartTimestamp)
    : Math.floor(Date.now() / 1000)

  const constructorArguments = [
    lootboxTokens,
    perUnitAmounts,
    feeInWei,
    amountDistributedPerOpen,
    openStartTimestampInUnix,
    whitelistRoot,
    keyHash,
    vrfCoordinatorV2,
    subscriptionId,
  ]
  const lootboxFactory = await ethers.getContractFactory('Lootbox')
  const lootbox = await lootboxFactory.deploy(...constructorArguments)
  await lootbox.deployed()
  console.log('Lootbox deployed to:', lootbox.address, network.name)

  // Add consumer to subscription
  // Note: The owner of the subscription must be the same as the deployer.
  // If you are using a different account, you will need comment out the following call.
  await chainlink.addVrfConsumer(
    vrfCoordinatorV2,
    lootbox.address,
    subscriptionId,
  )
  console.log(
    'Lootbox added as consumer to subscription with ID',
    subscriptionId.toString(),
  )

  // Verify contract
  console.log('Verifying Lootbox contract on Etherscan...')
  await lootbox.deployTransaction.wait(10)
  await run('verify:verify', {
    address: lootbox.address,
    contract: 'contracts/Lootbox.sol:Lootbox',
    constructorArguments,
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
