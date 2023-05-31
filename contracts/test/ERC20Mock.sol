// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20PresetFixedSupply} from "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol";

contract ERC20Mock is ERC20PresetFixedSupply {
  // solhint-disable-next-line no-empty-blocks
  constructor() ERC20PresetFixedSupply("ERC20Mock", "ERC20", 100 * 10 ** 18, msg.sender) {}
}
