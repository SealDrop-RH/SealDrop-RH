// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title PonsDrip
/// @notice Hands a reserve of tokens to a token's holders a slice at a time, for ever.
///
/// @dev The difference from PonsAirdrop is the shape of the giveaway. That one puts a pool on
/// the table and everyone takes their cut once. This one takes a percentage of whatever is
/// *left* on every interval, so the same 5% is a smaller absolute amount each time:
/// 100,000 gives up 5,000, then 4,750 of the 95,000 that remain, then 4,512 of the 90,250.
///
/// That geometry is deliberate. A schedule that hands out a fixed slice has a last round, and
/// a known last round is a cliff that everyone sells into. A schedule that takes a share of
/// the remainder has no last round, only rounds too small to matter.
///
/// Release is continuous rather than stepped. `releasedAt` counts the round in flight pro rata
/// through its interval, so a holder who claimed a second ago is owed something again now and
/// claiming is never closed to someone the schedule already owes. Stepping it would make the
/// interval a gate on the claim button rather than what it actually is, which is a rate.
///
/// Two things this contract knows and two it does not:
///
///  - It knows the schedule, and it enforces it. Nothing can ever pay out more than
///    `releasedAt(block.timestamp)`, whatever any Merkle root says. That is the ceiling and
///    it is checked on every claim.
///  - It does not know who holds the token. No contract can: an ERC-20 cannot enumerate its
///    holders and no node will do it for you. So the split between holders arrives as the
///    root of a tree built off chain from Transfer logs, and a holder proves their leaf.
///
/// Leaves carry a *share*, not an amount:
/// `keccak256(bytes.concat(keccak256(abi.encode(account, share))))`, where share is that
/// wallet's fraction of the qualifying supply scaled by 1e18. What it is owed at any moment is
/// `releasedAt(now) * share / 1e18`, minus what it has already taken.
///
/// That is the difference that makes the whole thing run unattended. A leaf holding an amount
/// is a statement about one instant, so every payout needs a fresh root published on chain and
/// the drip stops dead the moment nothing is publishing. A leaf holding a share is a statement
/// about a *rule*, and the contract can evaluate it against its own clock for ever: the money
/// keeps arriving every round with nobody signing anything.
///
/// A root still has to be republished to take account of people buying and selling, and the
/// scheduled job does that. But if it never runs again, holders keep being paid on the shares
/// last published rather than being cut off, which is the right way round for a failure to go.
///
/// The double hash is the standard defence against passing an internal node off as a leaf.
///
/// What a creator may keep, and what they may never take:
///
///  - `revocable` is chosen at creation and is public for ever after. A revocable drip lets
///    its creator publish new roots and stop the schedule; a non-revocable one is beyond
///    anybody's reach the moment it is funded, including its creator's.
///  - Stopping ends the schedule and returns only what has *not* been released. What the
///    schedule already released stays in the contract and stays claimable by the holders it
///    was released to. There is no path in this contract, for anyone, that takes back a token
///    the schedule has already given away.
contract PonsDrip is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @dev Fixed point for the decay factor. 1e27 leaves room to multiply two of them inside
    /// a uint256 while keeping far more precision than any token's smallest unit.
    uint256 private constant RAY = 1e27;
    uint256 private constant BPS = 10_000;
    /// @notice Shares are fractions of the qualifying supply, scaled by this. 1e18 is all of it.
    uint256 public constant SHARE_SCALE = 1e18;

    uint32 public constant MIN_INTERVAL = 60;
    uint32 public constant MAX_INTERVAL = 365 days;

    struct Drip {
        address creator;
        address token;
        /// @dev Actually received, so a fee-on-transfer token cannot promise what it did not fund.
        uint256 reserve;
        uint256 claimed;
        /// @notice Root of the tree of cumulative entitlements for the latest snapshot.
        bytes32 merkleRoot;
        /// @notice The block those balances were read at, so anyone can rebuild the tree.
        uint64 snapshotBlock;
        /// @notice Balances below this do not qualify.
        /// @dev Stored rather than left off chain because the tree has to be reproducible. A
        /// holder asks for their proof long after the root was published, on a different
        /// machine; whoever rebuilds the tree needs every input that shaped it, and a
        /// threshold that lived only in the publisher's memory would make the rebuild a guess.
        uint256 minimumHolding;
        uint64 startsAt;
        /// @notice When the creator halted it. Zero while it is running.
        uint64 stoppedAt;
        /// @notice What the schedule had released at that moment. Zero while it is running.
        uint256 stoppedRelease;
        uint64 createdAt;
        /// @notice Share of the remainder released each round, in basis points.
        uint16 rateBps;
        uint32 intervalSeconds;
        /// @notice Stop after this many rounds. Zero means it runs until the remainder is dust.
        uint32 maxRounds;
        /// @notice A second address allowed to republish the root, and nothing else.
        /// @dev So a scheduled job can keep the holder set current without holding the
        /// creator's key. It cannot stop the drip, cannot move a token, and cannot change a
        /// single term; the most it can do is restate who holds what.
        address publisher;
        /// @notice Whether the creator kept the right to republish the root and to stop it.
        bool revocable;
    }

    Drip[] private _drips;
    mapping(uint256 id => mapping(address account => uint256 amount)) public claimedBy;
    mapping(address creator => uint256[] ids) private _byCreator;
    mapping(address token => uint256[] ids) private _byToken;

    event Created(
        uint256 indexed id,
        address indexed creator,
        address indexed token,
        uint256 reserve,
        uint16 rateBps,
        uint32 intervalSeconds,
        bool revocable
    );
    event RootUpdated(uint256 indexed id, bytes32 merkleRoot, uint64 snapshotBlock);
    event Claimed(uint256 indexed id, address indexed account, uint256 amount);
    event Stopped(uint256 indexed id, address indexed creator, uint256 returned);
    /// @notice A batch of holders paid without being asked. Each payment also emits Claimed.
    event Distributed(uint256 indexed id, address indexed by, uint256 accounts, uint256 amount);

    error ReserveZero();
    error RootZero();
    error RateOutOfRange(uint16 rateBps);
    error IntervalOutOfRange(uint32 intervalSeconds);
    error NoSuchDrip(uint256 id);
    error NotCreator(uint256 id, address caller);
    /// @dev The promise a non-revocable drip makes. Nobody can take it back, its creator included.
    error NotRevocable(uint256 id);
    error AlreadyStopped(uint256 id);
    error BadProof(uint256 id, address account);
    error NothingToClaim(uint256 id, address account);
    error NothingReceived();
    error NothingHeldBack(uint256 id);
    /// @dev The batch was built against a root that has since been republished.
    error StaleRoot(uint256 id, bytes32 current, bytes32 expected);
    error LengthMismatch();

    /// @notice Fund a drip and publish the first allocation root. Claiming opens immediately.
    /// @param reserve How much of `token` to set aside in total. The caller must have approved it.
    /// @param merkleRoot Root of the tree of (account, cumulative amount) leaves.
    /// @param snapshotBlock The block those balances were read at.
    /// @param minimumHolding Balances below this do not qualify. Zero includes every holder.
    /// @param rateBps Share of the remainder released each round. 500 is 5%.
    /// @param intervalSeconds Seconds between rounds. A minute is the floor.
    /// @param maxRounds Stop after this many rounds, or zero to run on.
    /// @param revocable Whether the creator keeps the right to republish the root and to stop it.
    function create(
        address token,
        uint256 reserve,
        bytes32 merkleRoot,
        uint64 snapshotBlock,
        uint256 minimumHolding,
        uint16 rateBps,
        uint32 intervalSeconds,
        uint32 maxRounds,
        address publisher,
        bool revocable
    ) external nonReentrant returns (uint256 id) {
        if (reserve == 0) revert ReserveZero();
        if (merkleRoot == bytes32(0)) revert RootZero();
        if (rateBps == 0 || rateBps > BPS) revert RateOutOfRange(rateBps);
        if (intervalSeconds < MIN_INTERVAL || intervalSeconds > MAX_INTERVAL) {
            revert IntervalOutOfRange(intervalSeconds);
        }

        IERC20 erc20 = IERC20(token);
        uint256 before = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), reserve);
        uint256 received = erc20.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();

        id = _drips.length;
        _drips.push(
            Drip({
                creator: msg.sender,
                token: token,
                reserve: received,
                claimed: 0,
                merkleRoot: merkleRoot,
                snapshotBlock: snapshotBlock,
                minimumHolding: minimumHolding,
                // Immediately. There is no opening date to pick, so there is no window in which
                // holders are watching terms that can still move.
                startsAt: _now(),
                stoppedAt: 0,
                stoppedRelease: 0,
                createdAt: _now(),
                rateBps: rateBps,
                intervalSeconds: intervalSeconds,
                maxRounds: maxRounds,
                publisher: publisher,
                revocable: revocable
            })
        );
        _byCreator[msg.sender].push(id);
        _byToken[token].push(id);

        emit Created(id, msg.sender, token, received, rateBps, intervalSeconds, revocable);
    }

    /// @notice Publish a fresh split, after a new snapshot of who holds the token.
    /// @dev Revocable drips only. Leaves are cumulative, so a new root moves the ceiling on what
    /// each account may have taken in total and never re-pays what they already took. The
    /// schedule itself is untouchable either way: no root can release a token early, because
    /// `claim` checks every payment against `releasedAt` regardless of what the tree says.
    function updateRoot(uint256 id, bytes32 merkleRoot, uint64 snapshotBlock) external {
        Drip storage drip = _get(id);
        // The nominated publisher may restate the split and do nothing else. Everything that
        // could cost a holder something stays with the creator.
        if (drip.creator != msg.sender && drip.publisher != msg.sender) {
            revert NotCreator(id, msg.sender);
        }
        if (!drip.revocable) revert NotRevocable(id);
        if (merkleRoot == bytes32(0)) revert RootZero();

        drip.merkleRoot = merkleRoot;
        drip.snapshotBlock = snapshotBlock;
        emit RootUpdated(id, merkleRoot, snapshotBlock);
    }

    /// @notice Claim whatever the schedule owes this account by now.
    /// @param share This account's fraction of the qualifying supply, scaled by SHARE_SCALE.
    /// @param proof The Merkle path for this account's leaf.
    /// @dev Nothing needs to have been published since the last claim. The entitlement is the
    /// share applied to the curve at this instant, so calling this a minute later simply pays a
    /// minute more. Still here now that payouts are pushed: it is how a holder the scheduled job
    /// skips gets paid, and how anyone gets paid if the job stops running altogether.
    function claim(uint256 id, uint256 share, bytes32[] calldata proof) external nonReentrant {
        Drip storage drip = _get(id);
        uint256 paid = _settle(id, drip, releasedAt(id, block.timestamp), msg.sender, share, proof, type(uint256).max);
        if (paid == 0) revert NothingToClaim(id, msg.sender);
    }

    /// @notice Pay a batch of holders, without any of them having to ask.
    /// @param expectedRoot The root the batch's proofs were built against.
    /// @param accounts Holders to pay. Each must be the account in its own leaf.
    /// @param shares Each holder's share, exactly as in the tree.
    /// @param proofs Each holder's Merkle path.
    /// @param amounts The most to send each holder this time. Never more than they are owed is
    /// sent whatever this says, so it can only hold a payment back, not inflate one.
    /// @return total What the batch paid out in all.
    /// @dev The creator or the nominated publisher only. Not because pushing can misdirect a
    /// token -- it cannot, every payment goes to the account its leaf names -- but because the
    /// caller decides how much of what has been released goes out now and to whom first.
    ///
    /// Why the amounts are the caller's. What an account is owed is its share of everything
    /// ever released, less what it has taken. Once a holder who was paid has sold and dropped out
    /// of the tree, what the remaining holders are owed adds up to more than is left to pay, for
    /// good. Paying each one in full would hand the next round to whoever comes first in the
    /// batch; the keeper instead sends everyone their share of what is left, which is the split
    /// a drip promises in the first place.
    ///
    /// Works on non-revocable drips too. It changes no term and cannot take anything back.
    function distribute(
        uint256 id,
        bytes32 expectedRoot,
        address[] calldata accounts,
        uint256[] calldata shares,
        bytes32[][] calldata proofs,
        uint256[] calldata amounts
    ) external nonReentrant returns (uint256 total) {
        Drip storage drip = _get(id);
        if (drip.creator != msg.sender && drip.publisher != msg.sender) revert NotCreator(id, msg.sender);
        // Built against a root that has since been replaced, every proof would fail one by one
        // at the cost of gas. Checked once, up front, with the reason in the revert.
        if (drip.merkleRoot != expectedRoot) revert StaleRoot(id, drip.merkleRoot, expectedRoot);
        uint256 count = accounts.length;
        if (shares.length != count || proofs.length != count || amounts.length != count) revert LengthMismatch();

        // The curve read once for the whole batch, not once per holder: it is the same instant.
        uint256 released = releasedAt(id, block.timestamp);
        for (uint256 i = 0; i < count; ++i) {
            total += _settle(id, drip, released, accounts[i], shares[i], proofs[i], amounts[i]);
        }
        emit Distributed(id, msg.sender, count, total);
    }

    /// @dev The one place a token leaves this contract for a holder. `claim` and `distribute`
    /// differ only in who asks, how many, and how much at most; the arithmetic and every check
    /// live here, so the two can never disagree about what anyone is owed.
    ///
    /// Pays the least of three things: what the account is owed, `limit`, and what the schedule
    /// has released that nobody has taken yet. Returns zero rather than reverting when that is
    /// nothing, so one holder who was paid a moment ago cannot sink a batch.
    function _settle(
        uint256 id,
        Drip storage drip,
        uint256 released,
        address account,
        uint256 share,
        bytes32[] calldata proof,
        uint256 limit
    ) private returns (uint256 paid) {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, share))));
        if (!MerkleProof.verify(proof, drip.merkleRoot, leaf)) revert BadProof(id, account);

        uint256 entitled = (released * share) / SHARE_SCALE;
        uint256 taken = claimedBy[id][account];
        if (entitled <= taken) return 0;
        paid = entitled - taken;
        if (paid > limit) paid = limit;

        // The wall. Whatever a root says -- shares summing past everything, or holders owed
        // more than is left because others were paid and sold -- the contract never pays a token
        // past its own curve. What is left goes out; the rest waits for the curve to release it.
        uint256 room = released > drip.claimed ? released - drip.claimed : 0;
        if (paid > room) paid = room;
        if (paid == 0) return 0;

        // What was actually paid, not the entitlement: a capped payment leaves the remainder
        // still owed rather than quietly writing it off.
        claimedBy[id][account] = taken + paid;
        drip.claimed += paid;

        IERC20(drip.token).safeTransfer(account, paid);
        emit Claimed(id, account, paid);
    }

    /// @notice Halt the schedule and take back only what it has not released.
    /// @dev Revocable drips only. What the schedule already released stays in this contract for
    /// the holders it was released to: this ends a giveaway, it does not reverse one.
    function stop(uint256 id) external nonReentrant returns (uint256 returned) {
        Drip storage drip = _get(id);
        if (drip.creator != msg.sender) revert NotCreator(id, msg.sender);
        if (!drip.revocable) revert NotRevocable(id);
        if (drip.stoppedAt != 0) revert AlreadyStopped(id);

        uint256 released = releasedAt(id, block.timestamp);
        returned = drip.reserve - released;
        if (returned == 0) revert NothingHeldBack(id);

        // Written before the transfer, and recorded rather than subtracted from the reserve.
        // Cutting `reserve` down to `released` would leave `releasedAt` recomputing the curve
        // against a smaller number every time it was called afterwards, which reads as the
        // schedule having released far less than it did and strands holders who had not
        // claimed. The reserve is what was funded; this is where the curve stopped.
        drip.stoppedAt = _now();
        drip.stoppedRelease = released;

        IERC20(drip.token).safeTransfer(msg.sender, returned);
        emit Stopped(id, msg.sender, returned);
    }

    /* ------------------------------------------------------------ the curve ---- */

    /// @notice How much of the reserve the schedule has released by `timestamp`.
    /// @dev Continuous: complete rounds, plus the round in flight counted pro rata through its
    /// interval. A stop freezes the reading at the moment it happened.
    function releasedAt(uint256 id, uint256 timestamp) public view returns (uint256) {
        Drip storage drip = _get(id);

        // Frozen: after a stop the schedule released exactly this, for ever, and the figure is
        // read back rather than recomputed so it cannot drift.
        if (drip.stoppedAt != 0 && timestamp >= drip.stoppedAt) return drip.stoppedRelease;

        uint256 at = timestamp;
        if (at < drip.startsAt) return 0;

        uint256 rounds = (at - drip.startsAt) / drip.intervalSeconds + 1;
        if (drip.maxRounds != 0 && rounds > drip.maxRounds) {
            return drip.reserve - _remainingAfter(drip.reserve, drip.rateBps, drip.maxRounds);
        }

        uint256 remaining = _remainingAfter(drip.reserve, drip.rateBps, rounds);
        uint256 settled = drip.reserve - remaining;

        uint256 into = (at - drip.startsAt) % drip.intervalSeconds;
        if (into == 0) return settled;

        // The next round's worth, taken as the difference between two remainders so that the
        // rounds of a schedule always sum to exactly what the schedule has released.
        uint256 next = remaining - _remainingAfter(drip.reserve, drip.rateBps, rounds + 1);
        return settled + (next * into) / drip.intervalSeconds;
    }

    /// @notice What the schedule is still holding back, which is what `stop` would return.
    /// @dev Zero once it has been stopped: the remainder went back to the creator then, so
    /// there is nothing left being held for anyone.
    function heldBack(uint256 id) external view returns (uint256) {
        Drip storage drip = _get(id);
        if (drip.stoppedAt != 0) return 0;
        return drip.reserve - releasedAt(id, block.timestamp);
    }

    /// @notice What `account` could take right now, given the leaf it can prove.
    /// @dev A pure read for a page. It does not verify the proof: the caller already has the
    /// amount from the published tree, and `claim` is where the proof is checked.
    function claimableOf(uint256 id, address account, uint256 share)
        external
        view
        returns (uint256)
    {
        Drip storage drip = _get(id);
        uint256 entitled = (releasedAt(id, block.timestamp) * share) / SHARE_SCALE;
        uint256 taken = claimedBy[id][account];
        if (entitled <= taken) return 0;

        uint256 owed = entitled - taken;
        uint256 headroom = releasedAt(id, block.timestamp) - drip.claimed;
        return owed < headroom ? owed : headroom;
    }

    /// @dev `reserve * (1 - rate)^rounds`, in RAY fixed point by repeated squaring.
    ///
    /// The exact integer form, `reserve * (BPS - rate)^n / BPS^n`, grows by four digits a round
    /// and overflows long before a minute-by-minute drip has run a week. This holds every
    /// intermediate inside a uint256 and costs log2(n) multiplications instead of n.
    function _remainingAfter(uint256 reserve, uint16 rateBps, uint256 rounds)
        private
        pure
        returns (uint256)
    {
        if (reserve == 0) return 0;
        if (rounds == 0) return reserve;
        // A full 100% round is a one-off wearing a schedule's clothes: the first one takes it all.
        if (rateBps >= BPS) return 0;

        uint256 factor = RAY;
        uint256 base = ((BPS - rateBps) * RAY) / BPS;
        uint256 n = rounds;

        while (n > 0) {
            if (n & 1 == 1) {
                factor = (factor * base) / RAY;
                // Decayed past the last unit anything is measured in. Nothing survives further.
                if (factor == 0) return 0;
            }
            n >>= 1;
            if (n > 0) base = (base * base) / RAY;
        }
        return (reserve * factor) / RAY;
    }

    /* ---------------------------------------------------------------- views ---- */

    function dripCount() external view returns (uint256) {
        return _drips.length;
    }

    function getDrip(uint256 id) external view returns (Drip memory) {
        return _get(id);
    }

    function dripIdsByCreator(address creator) external view returns (uint256[] memory) {
        return _byCreator[creator];
    }

    function dripIdsByToken(address token) external view returns (uint256[] memory) {
        return _byToken[token];
    }

    function latestDrips(uint256 offset, uint256 limit)
        external
        view
        returns (Drip[] memory page, uint256 total)
    {
        total = _drips.length;
        if (offset >= total) return (new Drip[](0), total);
        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        page = new Drip[](size);
        for (uint256 i = 0; i < size; ++i) {
            page[i] = _drips[total - 1 - offset - i];
        }
    }

    function _get(uint256 id) private view returns (Drip storage) {
        if (id >= _drips.length) revert NoSuchDrip(id);
        return _drips[id];
    }

    /// @dev See the note in PonsLock: one cast, one place. uint64 seconds outlive the sun.
    function _now() private view returns (uint64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(block.timestamp);
    }
}
