import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  CheckCircle,
  Copy,
  LinkBreak,
  MinusCircle,
  Storefront,
  UserMinus,
  UsersThree,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { PitchNav, type PitchSlide } from "@/components/pitch/PitchNav";

export const metadata: Metadata = {
  title: "Pitch · FNS",
  description: "Problem, solution, architecture and how FNS works, in four slides.",
};

const slides: PitchSlide[] = [
  { id: "problem", label: "Problem" },
  { id: "solution", label: "Solution" },
  { id: "architecture", label: "Architecture" },
  { id: "how", label: "How it works" },
];

const merchants = ["shopa.eth", "shopb.eth", "shopc.eth"];

export default function Pitch() {
  return (
    <>
      <header className="land-nav pitch-bar">
        <div className="land-nav-inner">
          <Link href="/" className="brand" aria-label="FNS home">
            <span className="brand-name">FNS</span>
            <span className="brand-sub">Fleet Naming Service</span>
          </Link>
          <PitchNav slides={slides} />
          <Link href="/editor" className="btn btn-primary">
            Open editor
            <ArrowRight size={18} weight="bold" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="pitch">
        {/* Problem */}
        <section id="problem" className="slide" aria-labelledby="problem-h">
          <div className="slide-inner slide-split">
            <div>
              <h1 id="problem-h" className="slide-title">
                AI agents need to live inside someone else&apos;s name
              </h1>
              <p className="slide-lede">
                A vendor runs support agents. Each merchant wants them under its own .eth name. Today that means one copy per merchant.
              </p>
              <ul className="pain">
                <li>
                  <XCircle size={22} weight="fill" className="text-red" aria-hidden />
                  <span>
                    <b>Identity fragments.</b> Three registrations of mia, nothing ties them together.
                  </span>
                </li>
                <li>
                  <XCircle size={22} weight="fill" className="text-red" aria-hidden />
                  <span>
                    <b>Firing is slow.</b> Revoking one agent means chasing every merchant.
                  </span>
                </li>
                <li>
                  <XCircle size={22} weight="fill" className="text-red" aria-hidden />
                  <span>
                    <b>Authority blurs.</b> Who can switch the agent off, the vendor or the merchant?
                  </span>
                </li>
              </ul>
            </div>
            <div className="mech-figure copies" aria-label="The same agent registered three separate times">
              <p className="switch-head">
                <UsersThree size={18} weight="bold" aria-hidden />
                Vendor fleet: mia, kai, rin
              </p>
              {merchants.map((m, i) => (
                <div key={m} className="copy-row">
                  <span className="copy-parent">
                    <Storefront size={18} weight="bold" aria-hidden />
                    {m}
                  </span>
                  <span className="copy-name">mia.support.{m}</span>
                  <span className="tag tone-orange">
                    <Copy size={14} weight="bold" aria-hidden />
                    Copy {i + 1}
                  </span>
                </div>
              ))}
              <p className="copies-foot">Three identities that must be kept in sync by hand.</p>
            </div>
          </div>
        </section>

        {/* Solution */}
        <section id="solution" className="slide" aria-labelledby="solution-h">
          <div className="slide-inner">
            <h2 id="solution-h" className="slide-title">
              Mount one registry under many names
            </h2>
            <p className="slide-lede">
              The fleet is one ENSv2 registry. Each merchant points its <span className="nm">support</span> name at it. Nothing is copied.
            </p>
            <div className="solution-grid">
              <div className="mech-figure fan" aria-label="Three names resolving to one agent token">
                <ul className="fan-names">
                  {merchants.map((m) => (
                    <li key={m}>mia.support.{m}</li>
                  ))}
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
              <div className="authority">
                <div className="auth-card">
                  <p className="auth-who">
                    <LinkBreak size={20} weight="bold" className="text-blue" aria-hidden />
                    Merchant owns the doorway
                  </p>
                  <p className="auth-q">&ldquo;Does this agent appear under my name?&rdquo;</p>
                  <p className="auth-a">Unmounts with one transaction. Only its names go dark.</p>
                </div>
                <div className="auth-card">
                  <p className="auth-who">
                    <UserMinus size={20} weight="bold" className="text-blue" aria-hidden />
                    Vendor owns the identity
                  </p>
                  <p className="auth-q">&ldquo;Does this agent exist at all?&rdquo;</p>
                  <p className="auth-a">Unregisters with one transaction. The agent goes dark everywhere.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section id="architecture" className="slide" aria-labelledby="arch-h">
          <div className="slide-inner">
            <h2 id="arch-h" className="slide-title">
              Built only from live ENSv2 contracts
            </h2>
            <p className="slide-lede">No custom Solidity. Registries and the resolver are ENS&apos;s own, deployed through its VerifiableFactory on Sepolia.</p>

            <div className="arch">
              <div className="arch-stack">
                <div className="arch-layer">
                  <p className="arch-label">Parent names: setSubregistry only, no resolver</p>
                  <ul className="arch-parents">
                    <li className="is-canon">
                      support.vendor.eth <span className="arch-note">canonical</span>
                    </li>
                    <li>support.shopa.eth</li>
                    <li>support.shopb.eth</li>
                    <li className="is-fake">
                      support.scam.eth <span className="arch-note">counterfeit</span>
                    </li>
                  </ul>
                </div>
                <ArrowDown size={22} weight="bold" className="arch-arrow" aria-hidden />
                <div className="arch-layer arch-core">
                  <p className="arch-label">Fleet UserRegistry</p>
                  <div className="arch-members">
                    {["mia", "kai", "rin"].map((a) => (
                      <span key={a} className="arch-member">
                        {a}
                      </span>
                    ))}
                    <span className="arch-member-note">one ERC-1155 token each</span>
                  </div>
                </div>
                <ArrowDown size={22} weight="bold" className="arch-arrow" aria-hidden />
                <div className="arch-layer">
                  <p className="arch-label">Shared PermissionedResolver, attached to members only</p>
                  <dl className="arch-records">
                    <div>
                      <dt>addr(60)</dt>
                      <dd>fleet settlement address</dd>
                    </div>
                    <div>
                      <dt>enf.canonical</dt>
                      <dd>support.vendor.eth</dd>
                    </div>
                    <div>
                      <dt>enf.parents</dt>
                      <dd>vendor, shopa, shopb</dd>
                    </div>
                    <div>
                      <dt>agent-context</dt>
                      <dd>fleet description</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="mech-figure arch-verifier">
                <p className="arch-label">Verifier: stock viem + the real UniversalResolver</p>
                <ul className="arch-checks">
                  <li>
                    <span className="cid">C1</span>Member token alive
                  </li>
                  <li>
                    <span className="cid">C2</span>Canonical registry match
                  </li>
                  <li>
                    <span className="cid">C3</span>Parent listed in enf.parents
                  </li>
                  <li>
                    <span className="cid">C4</span>Parent name not expired
                  </li>
                  <li>
                    <span className="cid">C5</span>Settlement address screened
                  </li>
                </ul>
                <div className="arch-verdicts">
                  <span className="tag tone-green">Green: endorsed</span>
                  <span className="tag tone-red">Red: counterfeit</span>
                  <span className="tag tone-orange">Orange: flagged payee</span>
                  <span className="tag">Black: not a member</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="slide" aria-labelledby="how-h">
          <div className="slide-inner">
            <h2 id="how-h" className="slide-title">
              Hire, resolve, fire, verify
            </h2>
            <p className="slide-lede">Every action is one transaction, signed by the party that owns it.</p>

            <ol className="flow">
              <li className="flow-step">
                <p className="flow-who">Merchant</p>
                <h3 className="flow-title">Hire</h3>
                <p className="flow-body">Points its support name at the fleet.</p>
                <code className="flow-code">setSubregistry(support, FLEET)</code>
              </li>
              <li className="flow-step">
                <p className="flow-who">Anyone</p>
                <h3 className="flow-title">Resolve</h3>
                <p className="flow-body">Any wallet reads the same agent token and records.</p>
                <p className="flow-result">
                  mia.support.shopa.eth
                  <CheckCircle size={18} weight="fill" className="text-green" aria-label="live" />
                </p>
              </li>
              <li className="flow-step">
                <p className="flow-who">Merchant or vendor</p>
                <h3 className="flow-title">Fire</h3>
                <p className="flow-body">Unmount kills one doorway. Unregister kills the agent everywhere.</p>
                <p className="flow-result is-dead">
                  mia.support.shopb.eth
                  <MinusCircle size={18} weight="fill" className="text-grey" aria-label="not live" />
                </p>
              </li>
              <li className="flow-step">
                <p className="flow-who">Verifier</p>
                <h3 className="flow-title">Verify</h3>
                <p className="flow-body">A counterfeit mount resolves, but fails two-sided consent.</p>
                <p className="flow-result is-fake">
                  mia.support.scam.eth
                  <XCircle size={18} weight="fill" className="text-red" aria-label="counterfeit" />
                </p>
              </li>
            </ol>

            <div className="flow-cta">
              <Link href="/editor" className="btn btn-primary btn-lg">
                Open editor
                <ArrowRight size={18} weight="bold" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
