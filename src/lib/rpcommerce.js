const baseURL = `${process.env.RED_PANDA_COMMERCE_API_URL}/api/public/store/${process.env.RED_PANDA_COMMERCE_STPRE_ID}`;
const headers = {
  Authorization: process.env.RED_PANDA_COMMERCE_STPRE_TOKEN,
  "x-store-token": process.env.RED_PANDA_COMMERCE_STPRE_TOKEN,
};

function buildFetchInit(fetchOptions = {}) {
  const init = { headers, ...fetchOptions };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" && !init.signal) {
    init.signal = AbortSignal.timeout(15000);
  }
  return init;
}

const RPCommerce = {
  async getCategoryByURL(url, locale = "en", includeSubCategories = true, level = 2, fetchOptions = {}) {
    const q = new URLSearchParams({
      url,
      includeSubCategories: String(includeSubCategories),
      locale,
      level: String(level),
      useFallbackLocale: "true",
    });
    const res = await fetch(`${baseURL}/categories/categoryByUrl?${q}`, buildFetchInit(fetchOptions));
    if (!res.ok) return null;
    const data = await res.json();
    return data.category ?? null;
  },

  async getProductsByCategory(categoryId, locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({
      categories: String(categoryId),
      locale,
      includeMedia: "true",
      includeCategories: "true",
      includeTags: "true",
      includeVariants: "true",
      includeAttributes: "true",
      useFallbackLocale: "true",
    });
    const res = await fetch(`${baseURL}/products?${q}`, buildFetchInit(fetchOptions));
    if (!res.ok) return null;
    const data = await res.json();
    return data.products ?? [];
  },

  async getCategoryById(categoryId, locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({ locale, useFallbackLocale: "true" });
    const res = await fetch(`${baseURL}/categories/${categoryId}?${q}`, buildFetchInit(fetchOptions));
    if (!res.ok) return null;
    const data = await res.json();
    return data.category ?? null;
  },

  async getCategoryFilters(categoryId, locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({ locale, useFallbackLocale: "true" });
    const res = await fetch(`${baseURL}/filters/categories/${categoryId}?${q}`, buildFetchInit(fetchOptions));
    if (!res.ok) return null;
    return res.json();
  },

  async getAllCategories(locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({ locale, useFallbackLocale: "true" });
    const res = await fetch(`${baseURL}/categories?${q}`, buildFetchInit(fetchOptions));
    if (!res.ok) return [];
    const data = await res.json();
    return data.categories ?? [];
  },

  async getAllProducts(locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({ locale, useFallbackLocale: "true" });
    const res = await fetch(`${baseURL}/products?${q}`, buildFetchInit(fetchOptions));
    if (!res.ok) return [];
    const data = await res.json();
    return data.products ?? [];
  },

  async getProductByUrl(url, locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({
      url,
      locale,
      useFallbackLocale: "true",
      includeMedia: "true",
      includeVariants: "true",
      includeAttributes: "true",
      includeCategories: "true",
      includeTags: "true",
      includeCustomData: "true",
    });
    const res = await fetch(`${baseURL}/products?${q}`, buildFetchInit(fetchOptions));
    if (!res.ok) return null;
    const data = await res.json();
    return data.products ?? [];
  },
};

export default RPCommerce;
