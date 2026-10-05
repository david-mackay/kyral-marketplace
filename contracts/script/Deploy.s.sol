// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KyralMarketplace} from "../src/KyralMarketplace.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// Env:
///   DEPLOYER_PRIVATE_KEY  required
///   OPERATOR_ADDRESS      defaults to deployer
///   TREASURY_ADDRESS      defaults to deployer
///   PLATFORM_FEE_BPS      defaults to 500
///   USDC_ADDRESS          if unset, deploys TestUSDC (testnet only)
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        uint16 feeBps = uint16(vm.envOr("PLATFORM_FEE_BPS", uint256(500)));
        address usdc = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast(pk);
        if (usdc == address(0)) {
            usdc = address(new TestUSDC());
            console.log("TestUSDC:", usdc);
        }
        KyralMarketplace market = new KyralMarketplace(IERC20(usdc), deployer, operator, treasury, feeBps);
        vm.stopBroadcast();

        console.log("KyralMarketplace:", address(market));
        console.log("USDC:", usdc);
    }
}
