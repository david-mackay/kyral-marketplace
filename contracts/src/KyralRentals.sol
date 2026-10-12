// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title KyralRentals
/// @notice Pay-per-second access to health data on Monad.
///
/// A researcher escrows `seats * duration * (rate + fee)` for a rental. Each
/// contributor the operator matches takes a seat and earns `rate` USDC per
/// second from the moment they join until the rental ends. The researcher has
/// access while the rental runs and can stop it early; unused time is refunded
/// on settlement. Contributors can claim what they've accrued at any moment.
contract KyralRentals is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 2_000;

    struct Rental {
        address renter;
        uint128 ratePerSecond;
        uint128 feePerSecond;
        uint64 endsAt;
        uint32 maxSeats;
        uint32 seats;
        bool settled;
        uint256 deposit;
        /// Sum of every contributor's join time, so total accrual is
        /// `rate * (seats * endsAt - sumJoinedAt)` without iterating.
        uint256 sumJoinedAt;
    }

    IERC20 public immutable usdc;

    address public operator;
    address public treasury;
    uint16 public feeBps;

    mapping(bytes32 rentalId => Rental) public rentals;
    mapping(bytes32 rentalId => mapping(address contributor => uint64)) public joinedAt;
    mapping(bytes32 rentalId => mapping(address contributor => uint256)) public claimed;

    event RentalCreated(
        bytes32 indexed rentalId,
        address indexed renter,
        uint128 ratePerSecond,
        uint128 feePerSecond,
        uint64 endsAt,
        uint32 maxSeats,
        uint256 deposit
    );
    event RentalJoined(bytes32 indexed rentalId, address indexed contributor, bytes32 dataHash);
    event RentalStopped(bytes32 indexed rentalId, uint64 endsAt);
    event RentalSettled(bytes32 indexed rentalId, uint256 refund, uint256 fees);
    event Claimed(address indexed account, uint256 amount);
    event OperatorUpdated(address operator);
    event TreasuryUpdated(address treasury);
    event FeeUpdated(uint16 feeBps);

    error NotOperator();
    error NotRenter();
    error ZeroAddress();
    error FeeTooHigh();
    error InvalidRental();
    error RentalExists();
    error RentalEnded();
    error RentalRunning();
    error RentalFull();
    error AlreadyJoined();
    error AlreadySettled();
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

    // ─── Renting ────────────────────────────────────────────────────────────

    function rentalDeposit(uint128 ratePerSecond, uint64 duration, uint32 maxSeats)
        public
        view
        returns (uint256 total, uint128 feePerSecond)
    {
        feePerSecond = uint128((uint256(ratePerSecond) * feeBps) / 10_000);
        total = uint256(maxSeats) * duration * (uint256(ratePerSecond) + feePerSecond);
    }

    function createRental(bytes32 rentalId, uint128 ratePerSecond, uint64 duration, uint32 maxSeats)
        external
        nonReentrant
    {
        _createRental(rentalId, ratePerSecond, duration, maxSeats);
    }

    function createRentalWithPermit(
        bytes32 rentalId,
        uint128 ratePerSecond,
        uint64 duration,
        uint32 maxSeats,
        uint256 permitValue,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        // A front-run permit leaves the allowance in place, so a revert here
        // must not block the rental.
        try IERC20Permit(address(usdc)).permit(msg.sender, address(this), permitValue, deadline, v, r, s) {} catch {}
        _createRental(rentalId, ratePerSecond, duration, maxSeats);
    }

    function _createRental(bytes32 rentalId, uint128 ratePerSecond, uint64 duration, uint32 maxSeats) private {
        if (ratePerSecond == 0 || duration == 0 || maxSeats == 0) revert InvalidRental();
        if (rentals[rentalId].renter != address(0)) revert RentalExists();

        (uint256 total, uint128 feePerSecond) = rentalDeposit(ratePerSecond, duration, maxSeats);
        uint64 endsAt = uint64(block.timestamp) + duration;
        rentals[rentalId] = Rental({
            renter: msg.sender,
            ratePerSecond: ratePerSecond,
            feePerSecond: feePerSecond,
            endsAt: endsAt,
            maxSeats: maxSeats,
            seats: 0,
            settled: false,
            deposit: total,
            sumJoinedAt: 0
        });
        usdc.safeTransferFrom(msg.sender, address(this), total);

        emit RentalCreated(rentalId, msg.sender, ratePerSecond, feePerSecond, endsAt, maxSeats, total);
    }

    /// @notice Seat a contributor the operator matched; they start earning now.
    /// @param dataHash Commitment to the de-identified data they're renting out.
    function joinRental(bytes32 rentalId, address contributor, bytes32 dataHash) external onlyOperator {
        if (contributor == address(0)) revert ZeroAddress();
        Rental storage rental = rentals[rentalId];
        if (rental.renter == address(0) || block.timestamp >= rental.endsAt) revert RentalEnded();
        if (rental.seats == rental.maxSeats) revert RentalFull();
        if (joinedAt[rentalId][contributor] != 0) revert AlreadyJoined();

        joinedAt[rentalId][contributor] = uint64(block.timestamp);
        rental.seats += 1;
        rental.sumJoinedAt += block.timestamp;

        emit RentalJoined(rentalId, contributor, dataHash);
    }

    /// @notice End the rental now. Access stops and earnings stop accruing.
    function stopRental(bytes32 rentalId) external {
        Rental storage rental = rentals[rentalId];
        if (msg.sender != rental.renter && msg.sender != operator && msg.sender != owner()) revert NotRenter();
        if (block.timestamp >= rental.endsAt) revert RentalEnded();
        rental.endsAt = uint64(block.timestamp);
        emit RentalStopped(rentalId, rental.endsAt);
    }

    /// @notice After the rental ends, pay the platform fee and refund unused
    /// time to the renter. Contributors' accrued earnings stay claimable.
    function settleRental(bytes32 rentalId) external nonReentrant {
        Rental storage rental = rentals[rentalId];
        if (rental.renter == address(0)) revert InvalidRental();
        if (block.timestamp < rental.endsAt) revert RentalRunning();
        if (rental.settled) revert AlreadySettled();
        rental.settled = true;

        uint256 seatSeconds = uint256(rental.seats) * rental.endsAt - rental.sumJoinedAt;
        uint256 earned = seatSeconds * rental.ratePerSecond;
        uint256 fees = seatSeconds * rental.feePerSecond;
        uint256 refund = rental.deposit - earned - fees;

        if (fees > 0) usdc.safeTransfer(treasury, fees);
        if (refund > 0) usdc.safeTransfer(rental.renter, refund);
        emit RentalSettled(rentalId, refund, fees);
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    function hasAccess(bytes32 rentalId, address account) external view returns (bool) {
        Rental storage rental = rentals[rentalId];
        return account == rental.renter && block.timestamp < rental.endsAt;
    }

    function earned(bytes32 rentalId, address contributor) public view returns (uint256) {
        uint64 joined = joinedAt[rentalId][contributor];
        if (joined == 0) return 0;
        Rental storage rental = rentals[rentalId];
        uint256 until = block.timestamp < rental.endsAt ? block.timestamp : rental.endsAt;
        return (until - joined) * rental.ratePerSecond;
    }

    function claimable(bytes32 rentalId, address contributor) public view returns (uint256) {
        return earned(rentalId, contributor) - claimed[rentalId][contributor];
    }

    // ─── Payouts ────────────────────────────────────────────────────────────

    /// @notice Push accrued earnings across rentals to `account`. Callable by
    /// anyone so a relayer can pay gas; funds only ever move to `account`.
    function claimFor(bytes32[] calldata rentalIds, address account) external nonReentrant returns (uint256 total) {
        for (uint256 i; i < rentalIds.length; ++i) {
            uint256 amount = claimable(rentalIds[i], account);
            if (amount == 0) continue;
            claimed[rentalIds[i]][account] += amount;
            total += amount;
        }
        if (total == 0) revert NothingToClaim();
        usdc.safeTransfer(account, total);
        emit Claimed(account, total);
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
