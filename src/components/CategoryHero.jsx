import Link from "next/link";
import { renderAccentText, renderMultilineText } from "@/utils/text";

function CategoryPills({ category, basePath }) {
  if (!category?.children?.length) return null;

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {category.children.map((child) => (
        <Link
          key={child.id}
          href={`${basePath}/${child.url}`}
          className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink transition-colors hover:border-accent hover:text-accent"
        >
          {child.name}
        </Link>
      ))}
    </div>
  );
}

export default function CategoryHero({ hero, category, basePath }) {
  const hasHeroContent = Boolean(hero?.headline || hero?.description || hero?.image?.url);

  if (hasHeroContent) {
    return (
      <div className="pb-10">
        {hero.image?.url && (
          <div className="w-full overflow-hidden bg-cream-dark" {...hero?.$?.image}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.image.url} alt={hero.image.title || hero.headline || ""} className="h-auto w-full object-cover" />
          </div>
        )}

        <div className="mt-6">
          {hero.headline && (
            <h1 key={hero.headline} className="font-serif text-4xl font-semibold text-ink" {...hero?.$?.headline}>
              {renderAccentText(hero.headline)}
            </h1>
          )}

          {hero.description && (
            <p key={hero.description} className="mt-3 max-w-xl text-sm leading-relaxed text-ink-light" {...hero?.$?.description}>
              {renderMultilineText(hero.description)}
            </p>
          )}

          <CategoryPills category={category} basePath={basePath} />
        </div>
      </div>
    );
  }

  if (!category) return null;

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        {category.image && (
          <div className="aspect-16/9 w-full overflow-hidden bg-cream-dark md:w-2/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="flex-1">
          <h1 className="font-serif text-4xl font-semibold text-ink">{category.name}</h1>

          {category.description && (
            <div
              className="mt-3 max-w-xl text-sm leading-relaxed text-ink-light [&_p]:mt-2"
              dangerouslySetInnerHTML={{ __html: category.description }}
            />
          )}

          <CategoryPills category={category} basePath={basePath} />
        </div>
      </div>
    </div>
  );
}
