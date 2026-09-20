import { concatHex, encodeAbiParameters, getAddress, getCreate2Address, keccak256, pad, type Address, type Hex } from "viem";

/** Polygon DepositWalletFactory (CREATE2). */
export const DEPOSIT_WALLET_FACTORY = getAddress("0x00000000000Fb5C9ADea0298D729A0CB3823Cc07");
/** Beacon used for wallets created after the June 2026 factory upgrade. */
export const DEPOSIT_WALLET_BEACON = getAddress("0x7A18EDfe055488A3128f01F563e5B479D92ffc3a");

const ERC1967_BEACON_PREFIX = 0x6100523d8160233d3973n;
const ERC1967_BEACON_CONST3 = "0x60195155f3363d3d373d3d363d602036600436635c60da" as Hex;
const ERC1967_BEACON_CONST2 = "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c" as Hex;
const ERC1967_BEACON_CONST1 = "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3" as Hex;

function ownerWord(owner: Address): Hex {
  return pad(getAddress(owner), { size: 32 });
}

export function depositWalletArgs(owner: Address, factory: Address = DEPOSIT_WALLET_FACTORY): Hex {
  return encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [getAddress(factory), ownerWord(owner)],
  );
}

function beaconProxyInitCode(beacon: Address, owner: Address, factory: Address): Hex {
  const args = depositWalletArgs(owner, factory);
  const argsLen = (args.length - 2) / 2;
  const combined = ERC1967_BEACON_PREFIX + (BigInt(argsLen) << 56n);
  const prefix = `0x${combined.toString(16).padStart(32, "0").slice(-20)}` as Hex;
  return concatHex([
    prefix,
    getAddress(beacon),
    ERC1967_BEACON_CONST3,
    ERC1967_BEACON_CONST2,
    ERC1967_BEACON_CONST1,
    args,
  ]);
}

/** Deterministic POLY_1271 deposit wallet for an EOA (current beacon-proxy factory). */
export function deriveBeaconDepositWallet(owner: Address): Address {
  const factory = DEPOSIT_WALLET_FACTORY;
  const args = depositWalletArgs(owner, factory);
  return getCreate2Address({
    from: factory,
    salt: keccak256(args),
    bytecodeHash: keccak256(beaconProxyInitCode(DEPOSIT_WALLET_BEACON, owner, factory)),
  });
}
