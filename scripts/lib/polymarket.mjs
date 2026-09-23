import { getContractConfig } from "@polymarket/clob-client-v2";
import { concatHex, encodeAbiParameters, getAddress, getCreate2Address, keccak256, pad } from "viem";

const FACTORY = getAddress("0x00000000000Fb5C9ADea0298D729A0CB3823Cc07");
const BEACON = getAddress("0x7A18EDfe055488A3128f01F563e5B479D92ffc3a");
const ERC1967_BEACON_PREFIX = 0x6100523d8160233d3973n;
const ERC1967_BEACON_CONST3 = "0x60195155f3363d3d373d3d363d602036600436635c60da";
const ERC1967_BEACON_CONST2 = "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c";
const ERC1967_BEACON_CONST1 = "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3";

/** Polymarket deposit wallet (POLY_1271) owned by `owner`. Signature types 0 and 3 trade from it. */
export function deriveDepositWallet(owner) {
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [FACTORY, pad(getAddress(owner), { size: 32 })],
  );
  const argsLen = (args.length - 2) / 2;
  const combined = ERC1967_BEACON_PREFIX + (BigInt(argsLen) << 56n);
  const prefix = `0x${combined.toString(16).padStart(32, "0").slice(-20)}`;
  const initCode = concatHex([prefix, BEACON, ERC1967_BEACON_CONST3, ERC1967_BEACON_CONST2, ERC1967_BEACON_CONST1, args]);
  return getCreate2Address({ from: FACTORY, salt: keccak256(args), bytecodeHash: keccak256(initCode) });
}

/** pUSD collateral and the exchanges that must be approved to spend it. */
export function collateralConfig(chainId) {
  const contracts = getContractConfig(chainId);
  return {
    pusd: contracts.collateral,
    spenders: ["exchangeV2", "negRiskExchangeV2", "exchangeV3"].map((name) => [name, contracts[name]]),
  };
}
