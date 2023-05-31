// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC721PresetMinterPauserAutoId} from "@openzeppelin/contracts/token/ERC721/presets/ERC721PresetMinterPauserAutoId.sol";

contract ERC721Mock is ERC721PresetMinterPauserAutoId {
  constructor() ERC721PresetMinterPauserAutoId("ERC721Mock", "ERC721", "") {
    for (uint256 i = 0; i < 10; i++) {
      _mint(msg.sender, i);
    }
  }
}
