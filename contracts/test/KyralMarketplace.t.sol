// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KyralMarketplace} from "../src/KyralMarketplace.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract KyralMarketplaceTest is Test {
    KyralMarketplace market;
    TestUSDC usdc;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    uint256 buyerKey = 0xB0B;
    address buyer;

    bytes32 constant ITEM = keccak256("dataset:1");
    bytes32 constant HASH = keccak256("files");

    function setUp() public {
        buyer = vm.addr(buyerKey);
        usdc = new TestUSDC();
        market = new KyralMarketplace(usdc, owner, operator, treasury, 500);
        vm.prank(buyer);
        usdc.faucet();
    }

    function _recipients3() internal view returns (address[] memory r) {
        r = new address[](3);
        r[0] = alice;
        r[1] = bob;
        r[2] = carol;
    }

    function _list(uint128 price) internal {
        vm.prank(operator);
        market.upsertItem(ITEM, price, HASH, _recipients3(), true);
    }

    function test_purchaseSplitsRevenueAndGrantsAccess() public {
        _list(10e6);

        vm.startPrank(buyer);
        usdc.approve(address(market), 10e6);
        market.purchase(ITEM, 10e6, keccak256("p1"));
        vm.stopPrank();

        // 5% fee = 0.5 USDC; 9.5 USDC / 3 = 3.166666 each, 2 units of dust to treasury
        assertEq(market.claimable(alice), 3_166_666);
        assertEq(market.claimable(bob), 3_166_666);
        assertEq(market.claimable(carol), 3_166_666);
        assertEq(market.claimable(treasury), 500_000 + 2);
        assertTrue(market.hasAccess(ITEM, buyer));
        assertEq(usdc.balanceOf(address(market)), 10e6);
    }

    function test_purchaseWithPermit() public {
        _list(10e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                usdc.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                        buyer,
                        address(market),
                        uint256(10e6),
                        usdc.nonces(buyer),
                        deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerKey, digest);

        vm.prank(buyer);
        market.purchaseWithPermit(ITEM, 10e6, keccak256("p1"), deadline, v, r, s);
        assertTrue(market.hasAccess(ITEM, buyer));
    }

    function test_claimAndClaimFor() public {
        _list(10e6);
        vm.startPrank(buyer);
        usdc.approve(address(market), 10e6);
        market.purchase(ITEM, 10e6, keccak256("p1"));
        vm.stopPrank();

        vm.prank(alice);
        market.claim();
        assertEq(usdc.balanceOf(alice), 3_166_666);

        // Relayer pays gas, funds still go to bob
        vm.prank(operator);
        market.claimFor(bob);
        assertEq(usdc.balanceOf(bob), 3_166_666);
        assertEq(usdc.balanceOf(operator), 0);

        vm.expectRevert(KyralMarketplace.NothingToClaim.selector);
        market.claimFor(bob);
    }

    function test_revertsOnPriceAboveMax() public {
        _list(10e6);
        vm.startPrank(buyer);
        usdc.approve(address(market), 20e6);
        vm.expectRevert(abi.encodeWithSelector(KyralMarketplace.PriceAboveMax.selector, 10e6, 5e6));
        market.purchase(ITEM, 5e6, keccak256("p1"));
        vm.stopPrank();
    }

    function test_revertsOnReusedPurchaseRef() public {
        _list(1e6);
        vm.startPrank(buyer);
        usdc.approve(address(market), 2e6);
        market.purchase(ITEM, 1e6, keccak256("p1"));
        vm.expectRevert(KyralMarketplace.PurchaseRefUsed.selector);
        market.purchase(ITEM, 1e6, keccak256("p1"));
        vm.stopPrank();
    }

    function test_revertsWhenInactiveOrUnknown() public {
        vm.startPrank(buyer);
        usdc.approve(address(market), 1e6);
        vm.expectRevert(KyralMarketplace.ItemInactive.selector);
        market.purchase(ITEM, 1e6, keccak256("p1"));
        vm.stopPrank();

        _list(1e6);
        vm.prank(operator);
        market.setItemActive(ITEM, false);
        vm.prank(buyer);
        vm.expectRevert(KyralMarketplace.ItemInactive.selector);
        market.purchase(ITEM, 1e6, keccak256("p1"));
    }

    function test_onlyOperatorCanUpsert() public {
        vm.prank(alice);
        vm.expectRevert(KyralMarketplace.NotOperator.selector);
        market.upsertItem(ITEM, 1e6, HASH, _recipients3(), true);
    }

    function test_upsertBumpsVersionAndReplacesRecipients() public {
        _list(1e6);
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(operator);
        market.upsertItem(ITEM, 2e6, keccak256("files-v2"), r, true);

        (uint128 price, uint64 version,, bytes32 contentHash, address[] memory recipients) = market.getItem(ITEM);
        assertEq(price, 2e6);
        assertEq(version, 2);
        assertEq(contentHash, keccak256("files-v2"));
        assertEq(recipients.length, 1);
    }

    function test_feeCapEnforced() public {
        vm.prank(owner);
        vm.expectRevert(KyralMarketplace.FeeTooHigh.selector);
        market.setFeeBps(2_001);
    }

    bytes32 constant BOUNTY = keccak256("bounty:1");

    function _fundBounty(uint128 reward, uint32 maxFills) internal {
        (uint256 total,) = market.bountyDeposit(reward, maxFills);
        vm.startPrank(buyer);
        usdc.approve(address(market), total);
        market.createBounty(BOUNTY, reward, maxFills);
        vm.stopPrank();
    }

    function test_bountyEscrowsAndPaysFullReward() public {
        _fundBounty(40e6, 3);
        // 3 slots * (40 + 5% fee)
        assertEq(usdc.balanceOf(address(market)), 126e6);

        vm.prank(operator);
        market.fillBounty(BOUNTY, alice, keccak256("alice-data"));
        assertEq(market.claimable(alice), 40e6);
        assertEq(market.claimable(treasury), 2e6);
        assertTrue(market.hasAccess(BOUNTY, buyer));
    }

    function test_bountyRejectsDuplicateContributorAndClosesWhenFull() public {
        _fundBounty(10e6, 2);
        vm.startPrank(operator);
        market.fillBounty(BOUNTY, alice, bytes32(0));
        vm.expectRevert(KyralMarketplace.BountyAlreadyFilledBy.selector);
        market.fillBounty(BOUNTY, alice, bytes32(0));
        market.fillBounty(BOUNTY, bob, bytes32(0));
        vm.expectRevert(KyralMarketplace.BountyNotOpen.selector);
        market.fillBounty(BOUNTY, carol, bytes32(0));
        vm.stopPrank();
        (,,,, uint32 fills, bool open) = market.bounties(BOUNTY);
        assertEq(fills, 2);
        assertFalse(open);
    }

    function test_closeBountyRefundsUnfilledSlots() public {
        _fundBounty(10e6, 3);
        vm.prank(operator);
        market.fillBounty(BOUNTY, alice, bytes32(0));

        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        market.closeBounty(BOUNTY);
        assertEq(usdc.balanceOf(buyer) - before, 2 * 10.5e6);
        // Escrow left = alice's reward + one fee
        assertEq(usdc.balanceOf(address(market)), 10.5e6);
    }

    function test_onlyOperatorFillsAndOnlyFunderCloses() public {
        _fundBounty(10e6, 1);
        vm.prank(alice);
        vm.expectRevert(KyralMarketplace.NotOperator.selector);
        market.fillBounty(BOUNTY, alice, bytes32(0));
        vm.prank(alice);
        vm.expectRevert(KyralMarketplace.NotBountyFunder.selector);
        market.closeBounty(BOUNTY);
    }

    function test_bountyIdCannotBeReused() public {
        _fundBounty(1e6, 1);
        vm.startPrank(buyer);
        usdc.approve(address(market), 2e6);
        vm.expectRevert(KyralMarketplace.BountyExists.selector);
        market.createBounty(BOUNTY, 1e6, 1);
        vm.stopPrank();
    }

    function testFuzz_splitConservesFunds(uint128 price, uint8 n) public {
        price = uint128(bound(price, 1, 1_000e6));
        n = uint8(bound(n, 1, 50));
        address[] memory r = new address[](n);
        for (uint256 i; i < n; ++i) r[i] = address(uint160(0x1000 + i));
        vm.prank(operator);
        market.upsertItem(ITEM, price, HASH, r, true);

        vm.startPrank(buyer);
        usdc.approve(address(market), price);
        market.purchase(ITEM, price, keccak256("p"));
        vm.stopPrank();

        uint256 total = market.claimable(treasury);
        for (uint256 i; i < n; ++i) total += market.claimable(r[i]);
        assertEq(total, price);
    }
}
