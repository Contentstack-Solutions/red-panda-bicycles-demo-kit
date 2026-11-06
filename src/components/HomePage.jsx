"use client";
import { ContentstackClient, cslp } from "@/lib/contentstack-client";
import { HOMEPAGE_REFERENCES } from "@/lib/homepageReferences";
import { useState, useEffect } from "react";
import Hero from "@/components/Hero";
import CategoryBanner from "@/components/CategoryBanner";
import TrustStrip from "@/components/TrustStrip";
import TextAndImage from "@/components/TextAndImage";
import Newsletter from "@/components/Newsletter";
import TripPlanner from "@/components/TripPlanner";
import ArticlePreviews from "@/components/ArticlePreviews";

const BLOCK_COMPONENTS = {
  category_banner: CategoryBanner,
  trip_planner: TripPlanner,
  trust_strip: TrustStrip,
  text_and_image: TextAndImage,
  article_previews: ArticlePreviews,
  newsletter_signup: Newsletter,
};

// Client half of the homepage (Live Preview re-fetches the entry here). The server
// route passes in data that isn't part of the homepage entry, like the newest articles.
export default function HomePage({ locale, initialData, latestArticles }) {
  const [entry, setEntry] = useState(initialData?.[0] ?? null);

  useEffect(() => {
    const fetchData = async () => {
      const data = await ContentstackClient.getElementByTypeWithRefs(
        "homepage",
        locale,
        HOMEPAGE_REFERENCES,
        initialData
      );
      setEntry(data?.[0] ?? null);
    };

    ContentstackClient.onEntryChange(fetchData);
  }, [locale, initialData]);

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
              <BlockComponent
                data={blockData}
                locale={locale}
                {...(blockType === "article_previews" ? { latestArticles } : {})}
              />
            </div>
          );
        })}
      </div>
      <p className="sr-only" {...entry?.$?.title}>{entry?.title}</p>
    </div>
  );
}
