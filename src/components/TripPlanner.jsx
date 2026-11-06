"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cslp } from "@/lib/contentstack-client";
import {
  DEFAULT_THRESHOLD_KM,
  formatKm,
  haversineKm,
  normalizeAttractions,
  recommendBikes,
  roundKm,
} from "@/lib/geo";
import { getDevicePosition } from "@/lib/geolocation";
import { statusMessage } from "@/lib/tripStatus";
import { bikeCard, bikeHref } from "@/lib/tripLinks";
import { buildBikeClickEvent, buildTripEvent, trackTripSelection } from "@/lib/tripTracking";
import { PERSONALIZE_EVENTS, triggerPersonalizeEvent } from "@/lib/analytics";
import { usePersonalize } from "@/context/personalize.context";
import { renderAccentText, renderMultilineText } from "@/utils/text";
import { sectionBackgroundClass } from "@/utils/sectionBackground";

// Leaflet touches `window`, so the map only ever renders in the browser.
const TripPlannerMap = dynamic(() => import("./TripPlannerMap"), {
  ssr: false,
  loading: () => <div className="aspect-4/3 w-full bg-cream-dark" />,
});

const DEFAULT_FALLBACK = { lat: 52.3791, lng: 4.9003, label: "Amsterdam Centraal" };
const DEFAULT_MAX_ORIGIN_KM = 50;

function Arrow({ className = "" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export default function TripPlanner({ data, locale = "en" }) {
  const personalize = usePersonalize();
  const fallback = useMemo(
    () => ({
      lat: data?.fallback_latitude ?? DEFAULT_FALLBACK.lat,
      lng: data?.fallback_longitude ?? DEFAULT_FALLBACK.lng,
      label: data?.fallback_label || DEFAULT_FALLBACK.label,
      source: "fallback",
    }),
    [data?.fallback_latitude, data?.fallback_longitude, data?.fallback_label]
  );
  const thresholdKm = data?.threshold_km ?? DEFAULT_THRESHOLD_KM;
  const maxOriginKm = data?.max_origin_km ?? DEFAULT_MAX_ORIGIN_KM;
  const bikes = data?.bikes ?? [];

  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [status, setStatus] = useState({ state: "idle" });
  const [selectedUid, setSelectedUid] = useState(null);
  // Browsing only highlights an attraction; bikes show (and Lytics hears about
  // it) once the visitor asks for a recommendation.
  const [confirmedUid, setConfirmedUid] = useState(null);
  const origin = deviceOrigin ?? fallback;

  const attractions = useMemo(() => normalizeAttractions(data?.attractions), [data?.attractions]);

  // Distances are rounded once here so the label and the bike rule always agree.
  const rows = useMemo(() => {
    const withKm = attractions.map((attraction) => ({ ...attraction, km: roundKm(haversineKm(origin, attraction)) }));
    return origin.source === "device" ? [...withKm].sort((a, b) => a.km - b.km) : withKm;
  }, [attractions, origin]);

  const selected = rows.find((row) => row.uid === selectedUid) ?? null;
  const isConfirmed = selected !== null && selected.uid === confirmedUid;
  const recommended = selected ? recommendBikes(bikes, selected.km, thresholdKm) : [];

  async function locate() {
    setStatus({ state: "locating" });
    try {
      const position = await getDevicePosition();
      const kmFromFallback = haversineKm(position, fallback);
      if (kmFromFallback > maxOriginKm) {
        setDeviceOrigin(null);
        setStatus({ state: "far", km: kmFromFallback });
        return;
      }
      setDeviceOrigin({ ...position, label: "Your location", source: "device" });
      setStatus({ state: "device" });
    } catch (error) {
      setDeviceOrigin(null);
      setStatus({ state: error?.code === "denied" ? "denied" : "error" });
    }
  }

  // On small screens the recommendations sit below the map and list, so a pin
  // tap scrolls them into view; list clicks leave the scroll position alone.
  const recommendationsRef = useRef(null);
  const scrollOnSelectRef = useRef(false);

  useEffect(() => {
    if (!selectedUid || !scrollOnSelectRef.current) return;
    scrollOnSelectRef.current = false;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      recommendationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedUid]);

  function selectFromMap(uid) {
    if (uid === selectedUid) {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        recommendationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    scrollOnSelectRef.current = true;
    select(uid);
  }

  function select(uid) {
    setSelectedUid(uid);
  }

  function clickBike(bike) {
    trackTripSelection(buildBikeClickEvent({ attraction: selected?.title, bike }));
    triggerPersonalizeEvent(personalize, PERSONALIZE_EVENTS.bikeRecommendationClicked);
  }

  function recommend() {
    if (!selected || isConfirmed) return;
    setConfirmedUid(selected.uid);
    trackTripSelection(
      buildTripEvent({
        attraction: selected.title,
        km: selected.km,
        thresholdKm,
        bikes: recommended,
        originSource: origin.source,
      })
    );
  }

  return (
    <section className={`${sectionBackgroundClass(data?.background_color, "bg-white")} px-6 py-12`}>
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-light" {...data?.$?.eyebrow_text}>
          {data?.eyebrow_text}
        </p>
        <h2 key={data?.title ?? ""} className="mt-3 font-serif text-4xl font-semibold text-ink" {...data?.$?.title}>
          {renderAccentText(data?.title)}
        </h2>
        {data?.intro && (
          <p key={data.intro} className="mt-4 max-w-2xl text-lg leading-snug text-ink-light" {...data?.$?.intro}>
            {renderMultilineText(data.intro)}
          </p>
        )}

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-5">
          <div className="order-2 lg:order-1 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
              <p className="flex items-center gap-2 text-sm text-ink-light" role="status" aria-live="polite">
                <PinIcon />
                {statusMessage(status, fallback.label)}
              </p>
              <button
                type="button"
                onClick={locate}
                disabled={status.state === "locating"}
                className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-dark disabled:cursor-wait disabled:opacity-60"
              >
                {status.state === "locating" ? "Locating…" : "Use my location"}
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="visual-builder__empty-block-parent mt-4 h-40" {...data?.$?.attractions} />
            ) : (
              <ul className="scrollbar-hide divide-y divide-ink/10 overflow-y-auto lg:max-h-120" {...data?.$?.attractions}>
                {rows.map((row) => {
                  const isSelected = row.uid === selectedUid;
                  return (
                    <li key={row.uid}>
                      <button
                        type="button"
                        onClick={() => select(row.uid)}
                        aria-pressed={isSelected}
                        className={`flex w-full items-center gap-4 border-l-4 px-4 py-4 text-left transition-colors ${
                          isSelected ? "border-accent bg-cream-dark" : "border-transparent hover:bg-cream-dark/60"
                        }`}
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-cream ${isSelected ? "bg-accent" : "bg-ink"}`}>
                          {row.number}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink" {...row.$?.title}>{row.title}</span>
                          {row.blurb && (
                            <span className="block truncate text-sm text-ink-light" {...row.$?.blurb}>{row.blurb}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-ink">{formatKm(row.km)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="order-1 lg:order-2 lg:col-span-3">
            <TripPlannerMap origin={origin} attractions={attractions} selectedUid={selectedUid} onSelect={selectFromMap} />
          </div>
        </div>

        <div ref={recommendationsRef} className="scroll-mt-6" aria-live="polite">
        {selected && (
          <div className="mt-14">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <p className="text-lg text-ink">
                Heading to <span className="font-semibold">{selected.title}</span> · {formatKm(selected.km)}
                {isConfirmed && " — we recommend:"}
              </p>
              {!isConfirmed && (
                <button
                  type="button"
                  onClick={recommend}
                  className="inline-flex items-center gap-2 bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
                >
                  Recommend a bike
                  <Arrow />
                </button>
              )}
            </div>
            {!isConfirmed ? null : recommended.length === 0 ? (
              <p className="mt-4 text-sm text-ink-light">No bikes set up for this trip yet.</p>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8" {...data?.$?.bikes}>
                {recommended.map((bike) => {
                  const index = bikes.indexOf(bike);
                  const card = bikeCard(bike);
                  // Product-sourced title/image aren't edited on the bike, so skip its edit tags.
                  const editTags = card.fromProduct ? {} : bike?.$ ?? {};
                  return (
                    <Link
                      key={bike._metadata?.uid || index}
                      href={bikeHref(bike, locale)}
                      onClick={() => clickBike(bike)}
                      className="group block"
                      {...cslp(data, "bikes__", index)}
                    >
                      <div className="aspect-3/2 w-full overflow-hidden bg-cream-dark">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={card.image} alt={card.title} width={600} height={400} className={`h-full w-full ${card.fromProduct ? "object-contain" : "object-cover"}`} {...editTags.image} />
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <h3 className="text-lg font-semibold text-ink" {...editTags.title}>{card.title}</h3>
                        <Arrow className="shrink-0 text-ink transition-transform group-hover:translate-x-1" />
                      </div>
                      <p className="mt-1 text-sm text-ink-light" {...bike?.$?.description}>{bike.description}</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </section>
  );
}
