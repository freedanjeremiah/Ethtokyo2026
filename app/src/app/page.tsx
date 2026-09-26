import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle, LinkBreak, MinusCircle, UserMinus, XCircle } from "@phosphor-icons/react/dist/ssr";
import { HeroPreview } from "@/components/landing/HeroPreview";
import { LiveBlock } from "@/components/landing/LiveBlock";
import { encodePlaybook, presets } from "@/lib/playbook";

// The dashboard used to live here; its shareable links (?name=, ?playbook=) now open the editor.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const keep = new URLSearchParams();
  for (const key of ["name", "playbook"]) {
    const v = sp[key];
    if (typeof v === "string") keep.set(key, v);
  }
  if ([...keep.keys()].length) redirect(`/editor?${keep}`);

  return (
    <>
      <header className="land-nav">
        <div className="land-nav-inner">
          <Link href="/" className="brand" aria-label="ENF home">
            <span className="brand-name">ENF</span>
            <span className="brand-sub">Ethereum Naming Fleet</span>
          </Link>
          <nav className="land-links" aria-label="Page">
            <a href="#how">How it works</a>
            <Link href="/editor" className="btn btn-primary">
              Open editor
              <ArrowRight size={18} weight="bold" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      <main className="land">
        <section className="hero" aria-labelledby="hero-h">
          <div className="hero-copy">
            <h1 id="hero-h" className="hero-title">
              Hire a fleet with one transaction. Fire it with one.
            </h1>
            <p className="hero-lede">
              One ENSv2 agent registry under many .eth names, where the merchant and the vendor each switch it off in one transaction and any ENS
              client can spot a counterfeit.
            </p>
            <div className="hero-actions">
              <Link href="/editor" className="btn btn-primary btn-lg">
                Open editor
                <ArrowRight size={18} weight="bold" aria-hidden />
              </Link>
              <a href="#how" className="btn btn-neutral btn-lg">
                How it works
              </a>
            </div>
            <LiveBlock />
          </div>
          <HeroPreview />
        </section>

        <section id="how" className="how" aria-labelledby="how-h">
          <h2 id="how-h" className="section-title">
            One registry, reachable under every merchant&apos;s name
          </h2>
          <p className="section-lede">
            A vendor runs a support fleet: agents mia, kai and rin, each one token in one ENSv2 registry. Merchants mount that same registry under
            their own name. Nothing is copied, so every doorway answers with the same agents.
          </p>

          <div className="mech">
            <div className="mech-text">
              <h3 className="mech-title">One fleet, many doorways</h3>
              <p>
                Each merchant points <span className="nm">support.&lt;merchant&gt;.eth</span> at the fleet registry with <span className="mono">setSubregistry</span>, one
                transaction it controls. One registration then answers under every doorway: the same token, the same owner, resolved by stock ENS
                clients.
              </p>
            </div>
            <div className="mech-figure fan" aria-label="Three names resolving to one agent token">
              <ul className="fan-names">
                <li>mia.support.vendor.eth</li>
                <li>mia.support.shopa.eth</li>
                <li>mia.support.shopb.eth</li>
              </ul>
              <svg className="fan-lines" viewBox="0 0 80 150" aria-hidden preserveAspectRatio="none">
                <path d="M0 25 C 40 25, 40 75, 80 75" />
                <path d="M0 75 L 80 75" />
                <path d="M0 125 C 40 125, 40 75, 80 75" />
              </svg>
              <div className="fan-token">
                <span className="fan-label">One token</span>
                <span className="fan-value">mia</span>
                <span className="fan-sub">in the fleet registry</span>
              </div>
            </div>
          </div>

          <div className="mech">
            <div className="mech-text">
              <h3 className="mech-title">Two kill switches, opposite owners</h3>
              <p>
                The merchant can drop the fleet: one transaction clears its own doorway and nothing else. The vendor can fire an agent: one
                transaction unregisters it, and it goes dark under every doorway at once.
              </p>
            </div>
            <div className="mech-figure switches">
              <div className="switch">
                <p className="switch-head">
                  <LinkBreak size={18} weight="bold" className="text-red" aria-hidden />
                  The merchant unmounts
                </p>
                <ul className="rows">
                  <li className="row row-live">
                    kai.support.shopa.eth <CheckCircle size={18} weight="fill" className="text-green" aria-label="live" />
                  </li>
                  <li className="row row-dead">
                    kai.support.shopb.eth <MinusCircle size={18} weight="fill" className="text-grey" aria-label="not live" />
                  </li>
                  <li className="row row-live">
                    kai.support.vendor.eth <CheckCircle size={18} weight="fill" className="text-green" aria-label="live" />
                  </li>
                </ul>
              </div>
              <div className="switch">
                <p className="switch-head">
                  <UserMinus size={18} weight="bold" className="text-red" aria-hidden />
                  The vendor fires mia
                </p>
                <ul className="rows">
                  <li className="row row-dead">
                    mia.support.shopa.eth <MinusCircle size={18} weight="fill" className="text-grey" aria-label="not live" />
                  </li>
                  <li className="row row-dead">
                    mia.support.shopb.eth <MinusCircle size={18} weight="fill" className="text-grey" aria-label="not live" />
                  </li>
                  <li className="row row-dead">
                    mia.support.vendor.eth <MinusCircle size={18} weight="fill" className="text-grey" aria-label="not live" />
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mech">
            <div className="mech-text">
              <h3 className="mech-title">Counterfeits resolve. The verifier catches them.</h3>
              <p>
                Anyone can mount the fleet under their own name without asking, and ENS will resolve it. So a doorway only counts when both sides
                agree: the parent mounted the fleet, and the fleet lists that parent in its own <span className="mono">enf.parents</span> record.
              </p>
            </div>
            <div className="mech-figure checks" aria-label="Verifier checks for kai.support.scam.eth">
              <p className="checks-name">
                kai.support.scam.eth
                <span className="tag tone-red">
                  <XCircle size={14} weight="fill" aria-hidden />
                  Counterfeit
                </span>
              </p>
              <ul className="check-rows">
                <li>
                  <CheckCircle size={20} weight="fill" className="text-green" aria-label="passes" />
                  <span>Member token alive</span>
                  <span className="cid">C1</span>
                </li>
                <li>
                  <XCircle size={20} weight="fill" className="text-red" aria-label="fails" />
                  <span>
                    Two-sided consent
                    <span className="why">support.scam.eth is not in enf.parents</span>
                  </span>
                  <span className="cid">C3</span>
                </li>
                <li>
                  <CheckCircle size={20} weight="fill" className="text-green" aria-label="passes" />
                  <span>Doorway alive</span>
                  <span className="cid">C4</span>
                </li>
              </ul>
              <p className="checks-foot">Also checked: canonical registry match (C2) and counterparty screening (C5).</p>
            </div>
          </div>
        </section>

        <section className="close" aria-labelledby="close-h">
          <div className="close-copy">
            <h2 id="close-h" className="section-title">
              Write the demo as a playbook
            </h2>
            <p className="section-lede">
              Drop blocks on a canvas, wire them together, and branch on a check. Press Run and sign each transaction in your own wallet; the live
              fleet map shows what each step touches and what changed. The server never holds a key.
            </p>
            <Link href="/editor" className="btn btn-primary btn-lg">
              Open editor
              <ArrowRight size={18} weight="bold" aria-hidden />
            </Link>
          </div>
          <ul className="preset-list" aria-label="Open a demo playbook in the editor">
            {presets()
              .filter((p) => p.id !== "preset-reset")
              .map((p) => (
                <li key={p.id}>
                  <Link className="preset-link" href={`/editor?playbook=${encodePlaybook(p)}`}>
                    {p.title}
                    <ArrowRight size={18} weight="bold" aria-hidden />
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      </main>

      <footer className="land-foot">
        <span>ENF, the Ethereum Naming Fleet. Built on ENSv2 on Sepolia.</span>
        <Link href="/editor">Open editor</Link>
      </footer>
    </>
  );
}
