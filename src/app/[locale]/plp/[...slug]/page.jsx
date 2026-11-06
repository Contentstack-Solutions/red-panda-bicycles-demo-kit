"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ContentstackClient, cslp } from "@/lib/contentstack-client";
import { useDataContext, usePlpCommercePrefetch } from "@/context/data.context";
import { PLP_REFERENCES } from "@/lib/plpReferences";
import ProductBanner from "@/components/ProductBanner";
import TrustStrip from "@/components/TrustStrip";
import TextAndImage from "@/components/TextAndImage";
import Newsletter from "@/components/Newsletter";
import TripPlanner from "@/components/TripPlanner";
import CategoryHero from "@/components/CategoryHero";
import PLPGrid from "@/components/PLPGrid";

const BLOCK_COMPONENTS = {
  product_banner: ProductBanner,
  trip_planner: TripPlanner,
  trust_strip: TrustStrip,
  text_and_image: TextAndImage,
  newsletter_signup: Newsletter,
};

export default function PLPPage() {
  const params = useParams();
  const locale = params.locale;
  const slug = Array.isArray(params.slug) ? params.slug : [params.slug].filter(Boolean);
  const slugPath = slug.join("/");
  console.log("🚀 ~ PLPPage ~ slugPath:", slugPath)

  const initialData = useDataContext();
  const commerce = usePlpCommercePrefetch();

  const [entry, setEntry] = useState(initialData?.[0] ?? null);

  const getContent = useCallback(async () => {
    const data = await ContentstackClient.getElementByUrlWithRefs(
      "e_bikes",
      `/plp/${slugPath}`,
      locale,
      PLP_REFERENCES,
      initialData
    );
    setEntry(data?.[0] ?? null);
  }, [locale, slugPath, initialData]);

  useEffect(() => {
    ContentstackClient.onEntryChange(getContent);
  }, [getContent]);

  if (!commerce) return null;

  const hero = entry?.hero;
  const blocks = entry?.modular_blocks ?? [];
  const basePath = `/${locale}/plp`;

  return (
    <div>
      <div className="mx-auto max-w-7xl px-6 pt-10" {...entry?.$?.hero}>
        <CategoryHero hero={hero} category={commerce.category} basePath={basePath} />
      </div>


      <PLPGrid products={commerce.products} filters={commerce.filters} locale={locale} />

      <div
        className={blocks.length === 0 ? "visual-builder__empty-block-parent" : ""}
        {...entry?.$?.modular_blocks}
      >
        {blocks.map((block, index) => {
          const [blockType, blockData] = Object.entries(block).find(([key]) => key !== "_metadata") || [];
          const BlockComponent = BLOCK_COMPONENTS[blockType];
          if (!BlockComponent) return null;
          return (
            <div key={blockData?._metadata?.uid || index} {...cslp(entry, "modular_blocks__", index)}>
              <BlockComponent data={blockData} locale={locale} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
