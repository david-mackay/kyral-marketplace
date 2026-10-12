// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KyralRentals} from "../src/KyralRentals.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract KyralRentalsTest is Test {
    KyralRentals rentals;
    TestUSDC usdc;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address renter = makeAddr("renter");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 constant RENTAL = keccak256("rental:1");
    bytes32 constant HASH = keccak256("data");
    uint128 constant RATE = 1_000; // $0.001 per second
    uint64 constant DURATION = 3_600;

    function setUp() public {
        usdc = new TestUSDC();
        rentals = new KyralRentals(usdc, owner, operator, treasury, 500);
        vm.prank(renter);
        usdc.faucet();
    }

    function _create(uint32 seats) internal returns (uint256 deposit) {
        (deposit,) = rentals.rentalDeposit(RATE, DURATION, seats);
        vm.startPrank(renter);
        usdc.approve(address(rentals), deposit);
        rentals.createRental(RENTAL, RATE, DURATION, seats);
        vm.stopPrank();
    }

    function _join(address who) internal {
        vm.prank(operator);
        rentals.joinRental(RENTAL, who, HASH);
    }

    function _ids() internal pure returns (bytes32[] memory ids) {
        ids = new bytes32[](1);
        ids[0] = RENTAL;
    }

    function test_escrowsFullDurationPlusFee() public {
        uint256 deposit = _create(2);
        // 2 seats * 3600s * (1000 + 50 fee)
        assertEq(deposit, 2 * 3_600 * 1_050);
        assertEq(usdc.balanceOf(address(rentals)), deposit);
        assertTrue(rentals.hasAccess(RENTAL, renter));
        assertFalse(rentals.hasAccess(RENTAL, alice));
    }

    function test_earningsAccruePerSecondFromJoin() public {
        _create(2);
        _join(alice);
        vm.warp(block.timestamp + 100);
        _join(bob);
        vm.warp(block.timestamp + 50);

        assertEq(rentals.earned(RENTAL, alice), 150 * RATE);
        assertEq(rentals.earned(RENTAL, bob), 50 * RATE);
    }

    function test_claimMidStreamThenKeepEarning() public {
        _create(1);
        _join(alice);
        vm.warp(block.timestamp + 10);

        rentals.claimFor(_ids(), alice);
        assertEq(usdc.balanceOf(alice), 10 * RATE);
        assertEq(rentals.claimable(RENTAL, alice), 0);

        vm.warp(block.timestamp + 5);
        assertEq(rentals.claimable(RENTAL, alice), 5 * RATE);
        vm.expectRevert(KyralRentals.NothingToClaim.selector);
        rentals.claimFor(_ids(), bob);
    }

    function test_stopEndsAccessAndAccrual() public {
        _create(1);
        _join(alice);
        vm.warp(block.timestamp + 20);
        vm.prank(renter);
        rentals.stopRental(RENTAL);

        assertFalse(rentals.hasAccess(RENTAL, renter));
        vm.warp(block.timestamp + 1_000);
        assertEq(rentals.earned(RENTAL, alice), 20 * RATE);

        vm.prank(operator);
        vm.expectRevert(KyralRentals.RentalEnded.selector);
        rentals.joinRental(RENTAL, bob, HASH);
    }

    function test_settleRefundsUnusedTimeAndPaysFee() public {
        uint256 deposit = _create(2);
        uint256 before = usdc.balanceOf(renter);
        _join(alice);
        vm.warp(block.timestamp + 60);
        vm.prank(renter);
        rentals.stopRental(RENTAL);

        rentals.settleRental(RENTAL);
        uint256 earned = 60 * RATE;
        uint256 fees = 60 * 50;
        assertEq(usdc.balanceOf(treasury), fees);
        assertEq(usdc.balanceOf(renter) - before, deposit - earned - fees);

        // Contributor's earnings stay claimable after settlement.
        rentals.claimFor(_ids(), alice);
        assertEq(usdc.balanceOf(alice), earned);
        assertEq(usdc.balanceOf(address(rentals)), 0);

        vm.expectRevert(KyralRentals.AlreadySettled.selector);
        rentals.settleRental(RENTAL);
    }

    function test_cannotSettleWhileRunning() public {
        _create(1);
        vm.expectRevert(KyralRentals.RentalRunning.selector);
        rentals.settleRental(RENTAL);
    }

    function test_seatsAndPermissions() public {
        _create(1);
        _join(alice);

        vm.prank(operator);
        vm.expectRevert(KyralRentals.RentalFull.selector);
        rentals.joinRental(RENTAL, bob, HASH);

        vm.prank(alice);
        vm.expectRevert(KyralRentals.NotOperator.selector);
        rentals.joinRental(RENTAL, alice, HASH);

        vm.prank(alice);
        vm.expectRevert(KyralRentals.NotRenter.selector);
        rentals.stopRental(RENTAL);
    }

    function test_rejectsDuplicateJoinAndReusedId() public {
        _create(2);
        _join(alice);
        vm.prank(operator);
        vm.expectRevert(KyralRentals.AlreadyJoined.selector);
        rentals.joinRental(RENTAL, alice, HASH);

        vm.prank(renter);
        vm.expectRevert(KyralRentals.RentalExists.selector);
        rentals.createRental(RENTAL, RATE, DURATION, 1);
    }

    function testFuzz_settlementConservesFunds(uint64 joinA, uint64 joinB, uint64 stopAt) public {
        uint256 deposit = _create(2);
        uint256 start = block.timestamp;
        joinA = uint64(bound(joinA, 0, DURATION - 1));
        joinB = uint64(bound(joinB, joinA, DURATION - 1));
        stopAt = uint64(bound(stopAt, joinB + 1, DURATION + 500));

        vm.warp(start + joinA);
        _join(alice);
        vm.warp(start + joinB);
        _join(bob);
        vm.warp(start + stopAt);
        if (stopAt < DURATION) {
            vm.prank(renter);
            rentals.stopRental(RENTAL);
        }

        rentals.settleRental(RENTAL);
        rentals.claimFor(_ids(), alice);
        rentals.claimFor(_ids(), bob);

        uint256 paidOut = usdc.balanceOf(alice) + usdc.balanceOf(bob) + usdc.balanceOf(treasury);
        uint256 refunded = usdc.balanceOf(renter) - (1_000e6 - deposit);
        assertEq(paidOut + refunded, deposit);
        assertEq(usdc.balanceOf(address(rentals)), 0);
    }
}
