import { time } from '@nomicfoundation/hardhat-network-helpers'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { MerkleTree } from 'merkletreejs'
import keccak256 from 'keccak256'
import { Signer, ContractTransaction } from 'ethers'
import {
  Lootbox,
  ERC20Mock,
  ERC721Mock,
  ERC1155Mock,
  VRFCoordinatorV2Mock,
  Lootbox__factory as LootboxFactory,
  ERC20Mock__factory as ERC20MockFactory,
  ERC721Mock__factory as ERC721MockFactory,
  ERC1155Mock__factory as ERC1155MockFactory,
  VRFCoordinatorV2Mock__factory as VRFCoordinatorV2MockFactory,
} from '../typechain-types'

const { parseEther } = ethers.utils
const { HashZero } = ethers.constants
const { createRandom } = ethers.Wallet

let lootboxFactory: LootboxFactory
let erc20MockFactory: ERC20MockFactory
let erc721MockFactory: ERC721MockFactory
let erc1155MockFactory: ERC1155MockFactory
let vrfCoordinatorV2MockFactory: VRFCoordinatorV2MockFactory

before(async function () {
  lootboxFactory = (await ethers.getContractFactory(
    'Lootbox',
  )) as LootboxFactory
  erc20MockFactory = (await ethers.getContractFactory(
    'ERC20Mock',
  )) as ERC20MockFactory
  erc721MockFactory = (await ethers.getContractFactory(
    'ERC721Mock',
  )) as ERC721MockFactory
  erc1155MockFactory = (await ethers.getContractFactory(
    'ERC1155Mock',
  )) as ERC1155MockFactory
  vrfCoordinatorV2MockFactory = (await ethers.getContractFactory(
    'VRFCoordinatorV2Mock',
  )) as VRFCoordinatorV2MockFactory
})

async function getLootboxAddress(account: Signer, afterTxsCount: number) {
  return ethers.utils.getContractAddress({
    from: await account.getAddress(),
    nonce:
      (await ethers.provider.getTransactionCount(await account.getAddress())) +
      afterTxsCount,
  })
}

describe('Lootbox', function () {
  const tokens: Lootbox.TokenStruct[] = []
  const perUnitAmounts = [10, 1, 5]
  const amountDistributedPerOpen = 1
  const feePerOpen = parseEther('0.1')

  const baseFee = '100000000000000000'
  const gasPriceLink = '1000000000'
  const subscriptionId = 1
  const subscriptionFundAmount = parseEther('1')
  const keyHash = HashZero

  let supply: number
  let openStartTimestamp: number

  let owner: Signer
  let regularUser: Signer
  let whitelistedUser: Signer

  let lootbox: Lootbox
  let erc20: ERC20Mock
  let erc721: ERC721Mock
  let erc1155: ERC1155Mock
  let vrfCoordinatorV2Mock: VRFCoordinatorV2Mock

  let merkleTree: MerkleTree

  before(async function () {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    regularUser = accounts[1]
    whitelistedUser = accounts[3]

    merkleTree = new MerkleTree(
      [
        await whitelistedUser.getAddress(),
        createRandom().address,
        createRandom().address,
      ],
      keccak256,
      { sortPairs: true, hashLeaves: true },
    )
  })

  beforeEach(async function () {
    erc20 = await erc20MockFactory.deploy()
    erc721 = await erc721MockFactory.deploy()
    erc1155 = await erc1155MockFactory.deploy()

    tokens[0] = {
      assetContract: erc20.address,
      tokenId: 0,
      tokenType: 0,
      totalAmount: 100,
    }
    tokens[1] = {
      assetContract: erc721.address,
      tokenId: 0,
      tokenType: 1,
      totalAmount: 1,
    }
    tokens[2] = {
      assetContract: erc1155.address,
      tokenId: 0,
      tokenType: 2,
      totalAmount: 10,
    }

    supply = perUnitAmounts.reduce(
      (a, b, idx) => a + Number(tokens[idx].totalAmount) / b,
      0,
    )

    openStartTimestamp = await time.latest()

    vrfCoordinatorV2Mock = (await vrfCoordinatorV2MockFactory.deploy(
      baseFee,
      gasPriceLink,
    )) as VRFCoordinatorV2Mock
    await vrfCoordinatorV2Mock.createSubscription()
    await vrfCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      subscriptionFundAmount,
    )
  })

  describe('Deploy', function () {
    it('should revert if the token array is empty', async function () {
      await expect(
        lootboxFactory.deploy(
          [],
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWithCustomError(lootboxFactory, 'NoTokens')
    })

    it('should revert if the per unit amounts array has a length different than the token array', async function () {
      await expect(
        lootboxFactory.deploy(
          tokens,
          [1, 2],
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWithCustomError(lootboxFactory, 'InvalidLength')
    })

    it('should revert if token total amount is zero', async function () {
      tokens[0].totalAmount = 0

      await expect(
        lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWithCustomError(lootboxFactory, 'ZeroAmount')
    })

    it('should revert if token total amount is not a multiple of per unit amount', async function () {
      tokens[0].totalAmount = 3

      await expect(
        lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWithCustomError(lootboxFactory, 'InvalidTokenAmount')
    })

    it('should revert if ERC721 token total amount is not 1', async function () {
      tokens[1].totalAmount = 2

      await expect(
        lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWithCustomError(lootboxFactory, 'InvalidTokenAmount')
    })

    it('should revert if sum of reward units is not a multiple of amount distributed per open', async function () {
      const invalidDistributedAmount = 3

      await expect(
        lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          invalidDistributedAmount,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWithCustomError(lootboxFactory, 'InvalidLootboxSupply')
    })

    it('should revert if lootbox is not approved to transfer ERC20 tokens', async function () {
      await expect(
        lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWith('ERC20: insufficient allowance')
    })

    it('should revert if lootbox is not approved to transfer ERC721 tokens', async function () {
      const lootboxAddress = await getLootboxAddress(owner, 1)

      await erc20.approve(lootboxAddress, tokens[0].totalAmount)
      await expect(
        lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWith('ERC721: caller is not token owner or approved')
    })

    it('should revert if lootbox is not approved to transfer ERC1155 tokens', async function () {
      const lootboxAddress = await getLootboxAddress(owner, 2)

      await erc20.approve(lootboxAddress, tokens[0].totalAmount)
      await erc721.approve(lootboxAddress, tokens[1].tokenId)

      await expect(
        lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        ),
      ).to.be.revertedWith('ERC1155: caller is not token owner or approved')
    })

    context('when tokens are approved', function () {
      beforeEach(async function () {
        const lootboxAddress = await getLootboxAddress(owner, 3)

        await erc20.approve(lootboxAddress, tokens[0].totalAmount)
        await erc721.approve(lootboxAddress, tokens[1].tokenId)
        await erc1155.setApprovalForAll(lootboxAddress, true)
      })

      it('should transfer tokens to the lootbox', async function () {
        const lootbox = await lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        )

        const token1Balance = await erc20.balanceOf(lootbox.address)
        const token2Balance = await erc721.balanceOf(lootbox.address)
        const token3Balance = await erc1155.balanceOf(
          lootbox.address,
          tokens[2].tokenId,
        )

        expect(token1Balance).to.equal(tokens[0].totalAmount)
        expect(token2Balance).to.equal(tokens[1].totalAmount)
        expect(token3Balance).to.equal(tokens[2].totalAmount)
      })

      it('should create a record for the lootbox', async function () {
        const lootbox = await lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          HashZero,
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        )

        const lootboxInfo = await lootbox.getLootboxTokens()
        const token1 = lootboxInfo.tokens[0]
        const token2 = lootboxInfo.tokens[1]
        const token3 = lootboxInfo.tokens[2]

        expect(lootboxInfo.tokens).to.have.lengthOf(tokens.length)
        expect(lootboxInfo.perUnitAmounts).to.deep.eq(perUnitAmounts)

        expect(token1.assetContract).to.equal(tokens[0].assetContract)
        expect(token1.tokenId).to.equal(tokens[0].tokenId)
        expect(token1.tokenId).to.equal(tokens[0].tokenId)
        expect(token1.totalAmount).to.equal(tokens[0].totalAmount)
        expect(token2.assetContract).to.equal(tokens[1].assetContract)
        expect(token2.tokenId).to.equal(tokens[1].tokenId)
        expect(token2.tokenId).to.equal(tokens[1].tokenId)
        expect(token2.totalAmount).to.equal(tokens[1].totalAmount)
        expect(token3.assetContract).to.equal(tokens[2].assetContract)
        expect(token3.tokenId).to.equal(tokens[2].tokenId)
        expect(token3.tokenId).to.equal(tokens[2].tokenId)
        expect(token3.totalAmount).to.equal(tokens[2].totalAmount)
      })

      it('should enable private open when a whitelist hash is provided', async function () {
        const lootbox = await lootboxFactory.deploy(
          tokens,
          perUnitAmounts,
          feePerOpen,
          amountDistributedPerOpen,
          openStartTimestamp,
          merkleTree.getHexRoot(),
          keyHash,
          vrfCoordinatorV2Mock.address,
          subscriptionId,
        )

        await expect(
          lootbox.connect(whitelistedUser).publicOpen(1, { value: feePerOpen }),
        ).to.be.revertedWithCustomError(lootbox, 'NotAllowed')
      })
    })
  })

  describe('Open', function () {
    let delayedStart: number

    beforeEach(async function () {
      delayedStart = openStartTimestamp + 1000

      const lootboxAddress = await getLootboxAddress(owner, 3)

      await erc20.approve(lootboxAddress, tokens[0].totalAmount)
      await erc721.approve(lootboxAddress, tokens[1].tokenId)
      await erc1155.setApprovalForAll(lootboxAddress, true)

      lootbox = await lootboxFactory.deploy(
        tokens,
        perUnitAmounts,
        feePerOpen,
        amountDistributedPerOpen,
        delayedStart,
        HashZero,
        keyHash,
        vrfCoordinatorV2Mock.address,
        subscriptionId,
      )

      await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lootbox.address)
    })

    it("should revert when lootbox openning hasn't started", async function () {
      await expect(
        lootbox.connect(regularUser).publicOpen(1, { value: feePerOpen }),
      ).to.be.revertedWithCustomError(lootbox, 'OpeningNotStarted')
    })

    context('when lootbox openning has started', function () {
      beforeEach(async function () {
        await time.increaseTo(delayedStart)
      })

      it('should revert if amount to open is zero', async function () {
        await expect(
          lootbox.connect(regularUser).publicOpen(0),
        ).to.be.revertedWithCustomError(lootbox, 'ZeroAmount')
      })

      it('should revert if supply is exceeded', async function () {
        const amountExceedingSupply = supply + 1
        await expect(
          lootbox.connect(regularUser).publicOpen(amountExceedingSupply, {
            value: feePerOpen.mul(amountExceedingSupply),
          }),
        ).to.be.revertedWithCustomError(lootbox, 'SupplyExceeded')
      })

      it('should revert if fee is not enough', async function () {
        await expect(
          lootbox
            .connect(regularUser)
            .publicOpen(1, { value: feePerOpen.sub(1) }),
        ).to.be.revertedWithCustomError(lootbox, 'InsufficientValue')
      })

      it('should revert if opener has pending open request', async function () {
        await lootbox.connect(regularUser).publicOpen(1, { value: feePerOpen })
        await expect(
          lootbox.connect(regularUser).publicOpen(1, { value: feePerOpen }),
        ).to.be.revertedWithCustomError(lootbox, 'PendingOpenRequest')
      })

      it('should emit event', async function () {
        const regularUserAddress = await regularUser.getAddress()
        await expect(
          lootbox.connect(regularUser).publicOpen(1, { value: feePerOpen }),
        )
          .to.emit(lootbox, 'OpenRequested')
          .withArgs(regularUserAddress, 1, anyValue)
      })
    })
  })

  describe('Claim Rewards', function () {
    let openTx: ContractTransaction

    beforeEach(async function () {
      const lootboxAddress = await getLootboxAddress(owner, 3)

      await erc20.approve(lootboxAddress, tokens[0].totalAmount)
      await erc721.approve(lootboxAddress, tokens[1].tokenId)
      await erc1155.setApprovalForAll(lootboxAddress, true)

      lootbox = await lootboxFactory.deploy(
        tokens,
        perUnitAmounts,
        feePerOpen,
        amountDistributedPerOpen,
        openStartTimestamp,
        HashZero,
        keyHash,
        vrfCoordinatorV2Mock.address,
        subscriptionId,
      )

      await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lootbox.address)

      openTx = await lootbox
        .connect(regularUser)
        .publicOpen(supply, { value: feePerOpen.mul(supply) })
    })

    it('should revert if opener has no pending open request', async function () {
      await expect(
        lootbox.claimRewards(await owner.getAddress()),
      ).to.be.revertedWithCustomError(lootbox, 'NoPendingRequest')
    })

    it('should revert if randomness is not fulfilled', async function () {
      await expect(
        lootbox
          .connect(regularUser)
          .claimRewards(await regularUser.getAddress()),
      ).to.be.revertedWithCustomError(lootbox, 'RandomnessNotFulfilled')
    })

    it('should return false when canClaimRewards is called', async function () {
      expect(
        await lootbox.canClaimRewards(await regularUser.getAddress()),
      ).to.eq(false)
    })

    context('when open request is fulfilled', function () {
      let fulfillTx: ContractTransaction

      beforeEach(async function () {
        const openReceipt = await openTx.wait()
        const vrfRequestedEvent = openReceipt.events?.find(
          (event) => event.event === 'OpenRequested',
        )
        const requestId = vrfRequestedEvent?.args?.requestId

        fulfillTx = await vrfCoordinatorV2Mock.fulfillRandomWords(
          requestId,
          lootbox.address,
        )
      })

      it('should revert if opener has already claimed rewards', async function () {
        await lootbox
          .connect(regularUser)
          .claimRewards(await regularUser.getAddress())

        await expect(
          lootbox
            .connect(regularUser)
            .claimRewards(await regularUser.getAddress()),
        ).to.be.revertedWithCustomError(lootbox, 'NoPendingRequest')
      })

      it('should emit fulfilled event', async function () {
        await expect(fulfillTx).to.emit(lootbox, 'OpenRequestFulfilled')
      })

      it('should return true when canClaimRewards is called', async function () {
        expect(
          await lootbox.canClaimRewards(await regularUser.getAddress()),
        ).to.eq(true)
      })

      it('should transfer rewards to the opener', async function () {
        await lootbox
          .connect(regularUser)
          .claimRewards(await regularUser.getAddress())

        const token1Balance = await erc20.balanceOf(regularUser.getAddress())
        const token2Balance = await erc721.balanceOf(regularUser.getAddress())
        const token3Balance = await erc1155.balanceOf(
          regularUser.getAddress(),
          tokens[2].tokenId,
        )
        expect(token1Balance).to.equal(tokens[0].totalAmount)
        expect(token2Balance).to.equal(tokens[1].totalAmount)
        expect(token3Balance).to.equal(tokens[2].totalAmount)
      })

      it('should update token total amount', async function () {
        await lootbox
          .connect(regularUser)
          .claimRewards(await regularUser.getAddress())

        const lootboxInfo = await lootbox.getLootboxTokens()
        expect(lootboxInfo.tokens[0].totalAmount).to.equal(0)
        expect(lootboxInfo.tokens[1].totalAmount).to.equal(0)
        expect(lootboxInfo.tokens[2].totalAmount).to.equal(0)
      })

      it('should emit claimed event', async function () {
        await expect(
          lootbox
            .connect(regularUser)
            .claimRewards(await regularUser.getAddress()),
        )
          .to.emit(lootbox, 'RewardsClaimed')
          .withArgs(await regularUser.getAddress(), supply, anyValue)
      })
    })
  })

  describe('Private Open', function () {
    beforeEach(async function () {
      const lootboxAddress = await getLootboxAddress(owner, 3)

      await erc20.approve(lootboxAddress, tokens[0].totalAmount)
      await erc721.approve(lootboxAddress, tokens[1].tokenId)
      await erc1155.setApprovalForAll(lootboxAddress, true)

      lootbox = await lootboxFactory.deploy(
        tokens,
        perUnitAmounts,
        feePerOpen,
        amountDistributedPerOpen,
        openStartTimestamp,
        merkleTree.getHexRoot(),
        keyHash,
        vrfCoordinatorV2Mock.address,
        subscriptionId,
      )

      await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lootbox.address)
    })

    it('should revert if account is not whitelisted', async function () {
      await expect(
        lootbox
          .connect(regularUser)
          .privateOpen(
            1,
            merkleTree.getHexProof(await regularUser.getAddress()),
            { value: feePerOpen },
          ),
      ).to.be.revertedWithCustomError(lootbox, 'NotEligible')
    })

    it('should revert if proof is invalid', async function () {
      await expect(
        lootbox
          .connect(whitelistedUser)
          .privateOpen(
            1,
            merkleTree.getHexProof(keccak256(createRandom().address)),
            { value: feePerOpen },
          ),
      ).to.be.revertedWithCustomError(lootbox, 'NotEligible')
    })

    it('should revert if trying to call public open during private open', async function () {
      await expect(
        lootbox.connect(whitelistedUser).publicOpen(1, { value: feePerOpen }),
      ).to.be.revertedWithCustomError(lootbox, 'NotAllowed')
    })

    it('should not revert if account is whitelisted', async function () {
      await expect(
        await lootbox
          .connect(whitelistedUser)
          .privateOpen(
            1,
            merkleTree.getHexProof(
              keccak256(await whitelistedUser.getAddress()),
            ),
            { value: feePerOpen },
          ),
      ).to.not.be.reverted
    })
  })

  describe('Withdraw', function () {
    beforeEach(async function () {
      const lootboxAddress = await getLootboxAddress(owner, 3)

      await erc20.approve(lootboxAddress, tokens[0].totalAmount)
      await erc721.approve(lootboxAddress, tokens[1].tokenId)
      await erc1155.setApprovalForAll(lootboxAddress, true)

      lootbox = await lootboxFactory.deploy(
        tokens,
        perUnitAmounts,
        feePerOpen,
        amountDistributedPerOpen,
        openStartTimestamp,
        HashZero,
        keyHash,
        vrfCoordinatorV2Mock.address,
        subscriptionId,
      )

      await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lootbox.address)

      await lootbox.connect(regularUser).publicOpen(supply, {
        value: feePerOpen.mul(supply),
      })
    })

    it('should revert if not owner', async function () {
      await expect(lootbox.connect(regularUser).withdraw()).to.be.revertedWith(
        'Ownable: caller is not the owner',
      )
    })

    it('should transfer contract balance to owner', async function () {
      await expect(() => lootbox.withdraw()).to.changeEtherBalance(
        owner,
        feePerOpen.mul(supply),
      )
    })
  })

  // todo: test setters
})
