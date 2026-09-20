import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { deriveBeaconDepositWallet } from "@/server/polymarket/deposit-wallet";

describe("deriveBeaconDepositWallet", () => {
  it("matches the official Polygon vector for owner 0x1", () => {
    expect(deriveBeaconDepositWallet("0x0000000000000000000000000000000000000001")).toBe(
      getAddress("0x94bf330955a0b957662feaf878de77bf25f76cd9"),
    );
  });

  it("matches the polyrel fixture owner", () => {
    expect(deriveBeaconDepositWallet("0x6e0c80c90ea6c15917308f820eac91ce2724b5b5")).toBe(
      getAddress("0x1b7f973f23fb032a1f553625a9be25059843cd04"),
    );
  });
});
