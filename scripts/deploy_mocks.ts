import { ethers } from 'hardhat'

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const erc20MockFactory = await ethers.getContractFactory('ERC20Mock')
  const erc20Mock = await erc20MockFactory.deploy()
  await erc20Mock.deployed()
  console.log('ERC20Mock deployed to:', erc20Mock.address)

  const erc721MockFactory = await ethers.getContractFactory('ERC721Mock')
  const erc721Mock = await erc721MockFactory.deploy()
  await erc721Mock.deployed()
  console.log('ERC721Mock deployed to:', erc721Mock.address)

  const erc1155MockFactory = await ethers.getContractFactory('ERC1155Mock')
  const erc1155Mock = await erc1155MockFactory.deploy()
  await erc1155Mock.deployed()
  console.log('ERC1155Mock deployed to:', erc1155Mock.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
