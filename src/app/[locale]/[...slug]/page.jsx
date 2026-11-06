"use client";
import { ContentstackClient, cslp } from "@/lib/contentstack-client";
import { PAGE_REFERENCES } from "@/lib/pageReferences";
import { useState, useEffect, use } from "react";
import Hero from "@/components/Hero";
import ProductBanner from "@/components/ProductBanner";
import TrustStrip from "@/components/TrustStrip";
import TextAndImage from "@/components/TextAndImage";
import Newsletter from "@/components/Newsletter";
import TripPlanner from "@/components/TripPlanner";
import CategoryBanner from "@/components/CategoryBanner";

const BLOCK_COMPONENTS = {
  product_banner: ProductBanner,
  category_banner: CategoryBanner,
  trip_planner: TripPlanner,
  trust_strip: TrustStrip,
  text_and_image: TextAndImage,
  newsletter_signup: Newsletter,
};

export default function GenericPage({ params }) {
  const { locale, slug } = use(params);
  const url = `/${(slug ?? []).join("/")}`;

  const [entry, setEntry] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const data = await ContentstackClient.getElementByUrlWithRefs(
        "page",
        url,
        locale,
        PAGE_REFERENCES,
        null
      );
      setEntry(data?.[0] ?? null);
    };

    ContentstackClient.onEntryChange(fetchData);
  }, [locale, url]);
  console.info("GenericPage entry", entry);
  const hero = entry?.hero?.[0];
  const blocks = entry?.modular_blocks ?? [];

  return (
    <div>
      {hero && (
        <div {...entry?.$?.hero}>
          <Hero data={hero} locale={locale} />
        </div>
      )}
      <div
        className={blocks.length === 0 ? "visual-builder__empty-block-parent" : ""}
        {...entry?.$?.modular_blocks}
      >
        {blocks.map((block, index) => {
          const [blockType, blockData] = Object.entries(block).find(
            ([key]) => key !== "_metadata"
          ) || [];
          const BlockComponent = BLOCK_COMPONENTS[blockType];
          if (!BlockComponent) return null;
          return (
            <div key={blockData?._metadata?.uid || index} {...cslp(entry, "modular_blocks__", index)}>
              <BlockComponent data={blockData} locale={locale} />
            </div>
          );
        })}
      </div>
      <p className="sr-only" {...entry?.$?.title}>{entry?.title}</p>
    </div>
  );
}
