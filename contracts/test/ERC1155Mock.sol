// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC1155PresetMinterPauser} from "@openzeppelin/contracts/token/ERC1155/presets/ERC1155PresetMinterPauser.sol";

contract ERC1155Mock is ERC1155PresetMinterPauser {
  constructor() ERC1155PresetMinterPauser("ERC1155Mock") {
    _mint(msg.sender, 0, 100, "");
  }
}
