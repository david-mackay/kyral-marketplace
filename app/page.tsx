import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-6">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Built on Solana
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-50 leading-[1.1]">
              Own your health data.
              <br />
              <span className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                Earn from it.
              </span>
            </h1>
            <p className="mt-6 text-lg text-zinc-400 max-w-2xl leading-relaxed">
              Kyral is a decentralized marketplace where you can lend your health
              data to researchers, invest it in curated datasets, and earn USDC
              whenever it is purchased.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/marketplace"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors"
              >
                Explore Marketplace
              </Link>
              <Link
                href="/auth"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 font-medium text-sm transition-colors"
              >
                Connect Wallet
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            title="Upload & List"
            description="Upload your health records — labs, vitals, wearable data — and list them on the marketplace at your price."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            }
          />
          <FeatureCard
            title="Invest in Datasets"
            description="Contribute your data to curated datasets. When a dataset is purchased, you earn a proportional share of revenue."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
              />
            }
          />
          <FeatureCard
            title="Earn USDC"
            description="All transactions settle in USDC on Solana. Revenue is distributed automatically to data contributors."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            }
          />
          <FeatureCard
            title="Jupiter Swaps"
            description="Pay with any Solana token. Jupiter automatically swaps to USDC at the best rate before settlement."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            }
          />
          <FeatureCard
            title="Privacy First"
            description="You control what data you share. Access is granted only after purchase, with time-limited secure links."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            }
          />
          <FeatureCard
            title="Transparent Revenue"
            description="Every purchase and payout is recorded on-chain. Track your earnings in real time from your dashboard."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"
              />
            }
          />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-24">
        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-50">
            Ready to monetize your health data?
          </h2>
          <p className="mt-4 text-zinc-400 max-w-xl mx-auto">
            Connect your Solana wallet, upload your data, and start earning.
            It takes less than a minute.
          </p>
          <div className="mt-8">
            <Link
              href="/auth"
              className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card-glow rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-3">
      <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-emerald-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          {icon}
        </svg>
      </div>
      <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
    </div>
  );
}
