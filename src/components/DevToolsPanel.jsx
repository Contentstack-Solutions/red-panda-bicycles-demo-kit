"use client";

import { useState } from "react";
import JsonView from "@uiw/react-json-view";
import { lightTheme } from "@uiw/react-json-view/light";
import { useEntity } from "@/context/lyticsTracking";
import { describeAttributes, lookalikeMatches, ordinal, toList } from "@/lib/lyticsProfile";

const SCORES = [
  ["score_consistency", "Consistency"],
  ["score_frequency", "Frequency"],
  ["score_intensity", "Intensity"],
  ["score_maturity", "Maturity"],
  ["score_momentum", "Momentum"],
  ["score_propensity", "Propensity"],
  ["score_quantity", "Quantity"],
  ["score_recency", "Recency"],
  ["score_volatility", "Volatility"],
];

// Lytics interest scores are decimals up to 1; render as a 0-100 percentage.
function toPercent(value) {
  return Math.round(Math.min(value ?? 0, 1) * 100);
}

function ScoreBar({ label, value }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="flex items-center gap-3 py-1 text-xs">
      <div className="w-24 shrink-0 text-ink-light">{label}</div>
      <div className="w-8 shrink-0 text-right text-ink">{value ?? "—"}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-dark">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Section({ title, last = false, children }) {
  return (
    <div className={`py-3 ${last ? "" : "border-b border-ink/10"}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-light">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex items-start gap-3 py-1 text-xs">
      <div className="w-24 shrink-0 text-ink-light">{label}</div>
      <div className="min-w-0 flex-1 text-ink">{children || "—"}</div>
    </div>
  );
}

function RiderProfile({ user }) {
  const bikes = toList(user.products_owned);
  return (
    <Section title="Rider profile">
      <Field label="Bikes owned">
        {bikes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bikes.map((bike) => (
              <span key={bike} className="rounded-full bg-cream-dark px-2.5 py-0.5 text-[11px] text-ink">
                {bike}
              </span>
            ))}
          </div>
        )}
      </Field>
      <Field label="Cycling club">{user.club_membership}</Field>
      <Field label="Recommended">
        {user.recommended_bike && <span className="font-semibold text-accent">{user.recommended_bike}</span>}
      </Field>
      <Field label="Trade-in">{user.trade_in}</Field>
      {user.volt_review_text && (
        <figure className="mt-2 rounded-[4px] border-l-2 border-accent bg-cream-dark px-3 py-2">
          <blockquote className="text-xs italic text-ink">“{user.volt_review_text}”</blockquote>
          <figcaption className="mt-1 text-[11px] text-ink-light">RP Volt review</figcaption>
        </figure>
      )}
    </Section>
  );
}

function PercentileBar({ label, percentile }) {
  const pct = Math.max(0, Math.min(100, percentile));
  return (
    <div className="py-1 text-xs">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="truncate text-ink" title={label}>{label}</span>
        <span className="shrink-0 text-ink-light">
          <span className="font-semibold text-ink">{ordinal(percentile)}</span> percentile
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-cream-dark">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SummaryTab({ user }) {
  const lookalikes = lookalikeMatches(user.segment_prediction_percentile);
  return (
    <div className="px-3">
      <div className="flex items-center justify-between border-b border-ink/10 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-light">Lytics ID</span>
        <span className="text-xs text-ink">{user._id}</span>
      </div>

      <RiderProfile user={user} />

      <Section title="Audiences">
        <div className="flex flex-wrap gap-1.5">
          {user.segments?.length > 0 ? (
            user.segments.map((segment) => (
              <span key={segment} className="rounded-full border border-ink/15 px-2.5 py-0.5 text-[11px] text-ink">
                {segment}
              </span>
            ))
          ) : (
            <span className="text-xs text-ink-light">No audiences yet</span>
          )}
        </div>
      </Section>

      <Section title="Lookalike match">
        {lookalikes.length > 0 ? (
          lookalikes.map(({ model, label, percentile }) => <PercentileBar key={model} label={label} percentile={percentile} />)
        ) : (
          <span className="text-xs text-ink-light">No lookalike scores yet</span>
        )}
      </Section>

      <Section title="Behavioral scores">
        {SCORES.map(([key, label]) => (
          <ScoreBar key={key} label={label} value={user[key]} />
        ))}
      </Section>

      <Section title="Interests" last>
        {user.lytics_content && Object.keys(user.lytics_content).length > 0 ? (
          Object.entries(user.lytics_content).map(([topic, score]) => (
            <ScoreBar key={topic} label={topic} value={toPercent(score)} />
          ))
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-[4px] bg-cream-dark p-4 text-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-light">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <p className="text-xs text-ink-light">Browse more content to unlock interests.</p>
          </div>
        )}
      </Section>
    </div>
  );
}

function AttributeValue({ attribute }) {
  const { kind, value } = attribute;
  if (kind === "empty") return <span className="text-ink-light">None</span>;
  if (kind === "text") return <span className="wrap-break-word">{value}</span>;
  if (kind === "list") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item) => (
          <span key={item} className="border border-ink/15 px-2 py-0.5 text-[11px] text-ink">
            {item}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {value.map(({ name, display, pct }) => (
        <div key={name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate" title={name}>{name}</span>
            <span className="shrink-0 text-ink-light">{display}</span>
          </div>
          {pct !== undefined && (
            <div className="mt-0.5 h-1.5 overflow-hidden bg-cream-dark">
              <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AttributesTab({ user }) {
  const [showJson, setShowJson] = useState(false);
  return (
    <div className="px-3">
      <div className="flex justify-end border-b border-ink/10 py-2">
        <button
          type="button"
          onClick={() => setShowJson((show) => !show)}
          className="text-[11px] font-semibold uppercase tracking-wide text-accent hover:underline"
        >
          {showJson ? "Readable view" : "Raw JSON"}
        </button>
      </div>
      {showJson ? (
        <div className="py-3">
          <JsonView value={user || {}} keyName="user" style={lightTheme} />
        </div>
      ) : (
        describeAttributes(user).map((attribute) => (
          <div key={attribute.key} className="flex items-start gap-3 border-b border-ink/10 py-2.5 text-xs last:border-b-0">
            <div className="w-28 shrink-0">
              <p className="text-ink-light">{attribute.label}</p>
              <p className="mt-0.5 break-all font-mono text-[10px] text-ink-light/70">{attribute.key}</p>
            </div>
            <div className="min-w-0 flex-1 text-ink">
              <AttributeValue attribute={attribute} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function DevToolsPanel({ isOpen, onClose }) {
  const entity = useEntity();
  const user = entity?.data?.user;
  const [selectedTab, setSelectedTab] = useState("Summary");
  const [tabsOpen, setTabsOpen] = useState(false);

  const tabs = [
    { name: "Summary" },
    { name: "All Attributes", label: `Attributes (${Object.keys(user || {}).length})` },
  ];
  const activeTab = tabs.find((tab) => tab.name === selectedTab) ?? tabs[0];

  return (
    <div
      className={`fixed right-0 top-0 z-50 flex h-screen w-full flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-in-out sm:w-[420px] ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Contentstack dev tools"
    >
      <div className="flex shrink-0 items-center justify-between bg-ink px-4 py-3">
        <p className="text-sm font-semibold text-cream">Contentstack Dev Tools</p>
        <button type="button" onClick={onClose} aria-label="Close dev tools" className="text-cream/80 transition-colors hover:text-cream">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {!user ? (
        <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <p className="text-sm font-semibold text-ink">Lytics tag not found</p>
          <p className="text-xs text-ink-light">
            Add <code className="rounded bg-cream-dark px-1.5 py-0.5 text-accent">LYTICS_TAG</code> to your{" "}
            <code className="rounded bg-cream-dark px-1.5 py-0.5 text-accent">.env.local</code> file to enable live
            visitor profiling here.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative shrink-0 border-b border-ink/10">
            <button
              type="button"
              onClick={() => setTabsOpen((open) => !open)}
              className="flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-accent"
            >
              {activeTab.label || activeTab.name}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${tabsOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {tabsOpen && (
              <div className="absolute inset-x-0 top-full z-10 border-b border-ink/10 bg-white shadow-lg">
                {tabs.map((tab) => (
                  <button
                    key={tab.name}
                    type="button"
                    onClick={() => {
                      setSelectedTab(tab.name);
                      setTabsOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide transition-colors hover:bg-cream-dark ${
                      selectedTab === tab.name ? "text-accent" : "text-ink-light"
                    }`}
                  >
                    {tab.label || tab.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedTab === "Summary" && <SummaryTab user={user} />}
            {selectedTab === "All Attributes" && <AttributesTab user={user} />}
          </div>
        </div>
      )}
    </div>
  );
}
