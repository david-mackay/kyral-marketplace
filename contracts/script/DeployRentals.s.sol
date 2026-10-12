// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KyralRentals} from "../src/KyralRentals.sol";

/// Env:
///   DEPLOYER_PRIVATE_KEY  required
///   USDC_ADDRESS          required; the token the marketplace already uses
///   OPERATOR_ADDRESS      defaults to deployer
///   TREASURY_ADDRESS      defaults to deployer
///   PLATFORM_FEE_BPS      defaults to 500
contract DeployRentals is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address usdc = vm.envAddress("USDC_ADDRESS");
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        uint16 feeBps = uint16(vm.envOr("PLATFORM_FEE_BPS", uint256(500)));

        vm.startBroadcast(pk);
        KyralRentals rentals = new KyralRentals(IERC20(usdc), deployer, operator, treasury, feeBps);
        vm.stopBroadcast();

        console.log("KyralRentals:", address(rentals));
    }
}
