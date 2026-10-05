// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Testnet-only USDC stand-in with a public faucet so demo users can
/// buy data without bridging. Never deploy to mainnet.
contract TestUSDC is ERC20, ERC20Permit {
    uint256 public constant FAUCET_AMOUNT = 1_000e6;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastFaucetAt;

    error FaucetCooldown(uint256 availableAt);

    constructor() ERC20("Kyral Test USDC", "USDC") ERC20Permit("Kyral Test USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        uint256 availableAt = lastFaucetAt[msg.sender] + FAUCET_COOLDOWN;
        if (lastFaucetAt[msg.sender] != 0 && block.timestamp < availableAt) {
            revert FaucetCooldown(availableAt);
        }
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
