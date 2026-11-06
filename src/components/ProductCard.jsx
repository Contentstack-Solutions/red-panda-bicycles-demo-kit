import Link from "next/link";

export default function ProductCard({ product, locale = "en" }) {
  if (!product?.url) return null;

  return (
    <Link href={`/${locale}/pdp/${product.url}`} className="group block">
      <div className="aspect-5/3 w-full overflow-hidden bg-[#fafafa]">
        {product.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        {product.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {product.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="inline-block rounded-full bg-cream-dark px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-light"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        <h3 className="font-serif text-lg font-semibold text-ink transition-colors group-hover:text-accent">
          {product.name}
        </h3>

        {product.price != null && product.price !== "" && (
          <p className="text-sm font-medium text-ink-light">
            {product.currency_symbol}
            {Number(product.price).toLocaleString()}
          </p>
        )}

        {product.available === false && (
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Out of stock</p>
        )}
      </div>
    </Link>
  );
}
