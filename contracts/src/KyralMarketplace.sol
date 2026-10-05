// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title KyralMarketplace
/// @notice Health-data marketplace settlement on Monad.
///
/// Every listing (one person's data) and dataset (pooled data from many
/// contributors) is registered as an item with a USDC price, a content hash
/// committing to the underlying files, and the set of wallets that get paid.
///
/// Buyers pay the contract directly. Revenue is split on purchase into
/// per-recipient claimable balances, so the platform never custodies
/// contributor earnings and every payout is verifiable onchain.
contract KyralMarketplace is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 2_000;
    uint256 public constant MAX_RECIPIENTS = 256;

    struct Item {
        uint128 price;
        uint64 version;
        bool active;
        bytes32 contentHash;
        address[] recipients;
    }

    IERC20 public immutable usdc;

    address public operator;
    address public treasury;
    uint16 public feeBps;

    mapping(bytes32 itemId => Item) private _items;
    mapping(address account => uint256) public claimable;
    mapping(bytes32 itemId => mapping(address buyer => bool)) public hasAccess;
    mapping(bytes32 purchaseRef => bool) public purchaseRefUsed;

    event ItemUpserted(
        bytes32 indexed itemId,
        uint64 version,
        uint128 price,
        bytes32 contentHash,
        bool active,
        address[] recipients
    );
    event Purchased(
        bytes32 indexed purchaseRef,
        bytes32 indexed itemId,
        address indexed buyer,
        uint128 price,
        uint256 fee,
        bytes32 contentHash,
        uint64 version
    );
    event RevenueCredited(bytes32 indexed itemId, address indexed recipient, uint256 amount);
    event Claimed(address indexed account, uint256 amount);
    event OperatorUpdated(address operator);
    event TreasuryUpdated(address treasury);
    event FeeUpdated(uint16 feeBps);

    error NotOperator();
    error ZeroAddress();
    error FeeTooHigh();
    error InvalidPrice();
    error InvalidRecipients();
    error ItemInactive();
    error PriceAboveMax(uint128 price, uint128 maxPrice);
    error PurchaseRefUsed();
    error NothingToClaim();

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner()) revert NotOperator();
        _;
    }

    constructor(IERC20 usdc_, address owner_, address operator_, address treasury_, uint16 feeBps_)
        Ownable(owner_)
    {
        if (address(usdc_) == address(0) || operator_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        usdc = usdc_;
        operator = operator_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    // ─── Catalog ────────────────────────────────────────────────────────────

    /// @notice Register or update an item. Called by the Kyral operator whenever
    /// a listing or dataset changes (price, files, or contributor set).
    function upsertItem(
        bytes32 itemId,
        uint128 price,
        bytes32 contentHash,
        address[] calldata recipients,
        bool active
    ) external onlyOperator {
        if (price == 0) revert InvalidPrice();
        uint256 n = recipients.length;
        if (n == 0 || n > MAX_RECIPIENTS) revert InvalidRecipients();
        for (uint256 i; i < n; ++i) {
            if (recipients[i] == address(0)) revert ZeroAddress();
        }

        Item storage item = _items[itemId];
        item.price = price;
        item.contentHash = contentHash;
        item.active = active;
        item.recipients = recipients;
        unchecked {
            item.version += 1;
        }

        emit ItemUpserted(itemId, item.version, price, contentHash, active, recipients);
    }

    function setItemActive(bytes32 itemId, bool active) external onlyOperator {
        Item storage item = _items[itemId];
        if (item.version == 0) revert ItemInactive();
        item.active = active;
        unchecked {
            item.version += 1;
        }
        emit ItemUpserted(itemId, item.version, item.price, item.contentHash, active, item.recipients);
    }

    function getItem(bytes32 itemId)
        external
        view
        returns (
            uint128 price,
            uint64 version,
            bool active,
            bytes32 contentHash,
            address[] memory recipients
        )
    {
        Item storage item = _items[itemId];
        return (item.price, item.version, item.active, item.contentHash, item.recipients);
    }

    // ─── Purchases ──────────────────────────────────────────────────────────

    /// @notice Buy access to an item. Requires a prior USDC approval.
    /// @param maxPrice Protects the buyer from a price change between quote and execution.
    /// @param purchaseRef Opaque id linking this payment to an offchain order.
    function purchase(bytes32 itemId, uint128 maxPrice, bytes32 purchaseRef) external nonReentrant {
        _purchase(itemId, maxPrice, purchaseRef);
    }

    /// @notice Buy access in a single transaction using an EIP-2612 USDC permit.
    function purchaseWithPermit(
        bytes32 itemId,
        uint128 maxPrice,
        bytes32 purchaseRef,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        // A front-run permit leaves the allowance in place, so a revert here
        // must not block the purchase.
        try IERC20Permit(address(usdc)).permit(msg.sender, address(this), maxPrice, deadline, v, r, s) {} catch {}
        _purchase(itemId, maxPrice, purchaseRef);
    }

    function _purchase(bytes32 itemId, uint128 maxPrice, bytes32 purchaseRef) private {
        Item storage item = _items[itemId];
        if (!item.active) revert ItemInactive();
        uint128 price = item.price;
        if (price > maxPrice) revert PriceAboveMax(price, maxPrice);
        if (purchaseRefUsed[purchaseRef]) revert PurchaseRefUsed();
        purchaseRefUsed[purchaseRef] = true;

        usdc.safeTransferFrom(msg.sender, address(this), price);

        uint256 fee = (uint256(price) * feeBps) / 10_000;
        uint256 distributable = price - fee;
        address[] storage recipients = item.recipients;
        uint256 n = recipients.length;
        uint256 share = distributable / n;

        for (uint256 i; i < n; ++i) {
            address recipient = recipients[i];
            claimable[recipient] += share;
            emit RevenueCredited(itemId, recipient, share);
        }

        uint256 platformCut = fee + (distributable - share * n);
        if (platformCut > 0) claimable[treasury] += platformCut;

        hasAccess[itemId][msg.sender] = true;

        emit Purchased(purchaseRef, itemId, msg.sender, price, fee, item.contentHash, item.version);
    }

    // ─── Payouts ────────────────────────────────────────────────────────────

    function claim() external nonReentrant returns (uint256) {
        return _claim(msg.sender);
    }

    /// @notice Push an account's earnings to that account. Callable by anyone so
    /// a relayer can pay gas for users who hold no MON; funds only ever move to
    /// `account` itself.
    function claimFor(address account) external nonReentrant returns (uint256) {
        return _claim(account);
    }

    function _claim(address account) private returns (uint256 amount) {
        amount = claimable[account];
        if (amount == 0) revert NothingToClaim();
        claimable[account] = 0;
        usdc.safeTransfer(account, amount);
        emit Claimed(account, amount);
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }
}
