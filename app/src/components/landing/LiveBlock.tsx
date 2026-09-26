"use client";

// The landing's one live reading: the chain's current block, so "live on Sepolia" is shown, not claimed.
import { useEffect, useState } from "react";
import { fmtBlock } from "../ui";

export function LiveBlock() {
  const [block, setBlock] = useState<string | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/block", { cache: "no-store" });
        const body = (await res.json()) as { blockNumber?: string };
        if (cancelled) return;
        if (body.blockNumber) {
          setBlock(body.blockNumber);
          setDown(false);
        } else setDown(true);
      } catch {
        if (!cancelled) setDown(true);
      }
    }
    void poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (down) return <p className="live-line">Sepolia unreachable. Retrying…</p>;
  return (
    <p className="live-line">
      <span className="live" aria-hidden />
      {block ? (
        <>
          Live on Sepolia · block <span className="num">{fmtBlock(block)}</span>
        </>
      ) : (
        "Connecting to Sepolia"
      )}
    </p>
  );
}
