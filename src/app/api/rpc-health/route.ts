export async function GET() {
  const started = Date.now();

  try {
    const response = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      cache: "no-store",
    });

    return Response.json({
      ok: response.ok,
      ms: Date.now() - started,
      rpc: "HELIUS",
    });
  } catch {
    return Response.json({ ok: false, ms: null, rpc: "HELIUS" });
  }
}
