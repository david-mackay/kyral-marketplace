import { createHash } from "node:crypto";
import { encodePacked, keccak256, zeroHash, type Hex } from "viem";

export function sha256Hex(bytes: Buffer): Hex {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Order-independent commitment to a set of hashes. Used for a listing (over
 * its documents' sha256) and for a dataset (over its listings' commitments),
 * so anyone holding the files can recompute the anchored hash.
 */
export function commitToHashes(hashes: (string | null | undefined)[]): Hex {
  const present = hashes.filter((h): h is Hex => !!h).sort();
  if (present.length === 0) return zeroHash;
  return keccak256(
    encodePacked(
      present.map(() => "bytes32"),
      present
    )
  );
}
