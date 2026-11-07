// RP Commerce storefront client. The store is optional: without RED_PANDA_COMMERCE_API_URL and
// RED_PANDA_COMMERCE_STPRE_ID every method returns its empty result without a request, and an
// unreachable store also gives empty results, so pages fall back to the CMS (see pdpOverlay.js).
const API_URL = (process.env.RED_PANDA_COMMERCE_API_URL || "").replace(/\/$/, "");
const STORE_ID = process.env.RED_PANDA_COMMERCE_STPRE_ID || "";
const TOKEN = process.env.RED_PANDA_COMMERCE_STPRE_TOKEN || "";

export const commerceConfigured = Boolean(API_URL && STORE_ID);

const baseURL = `${API_URL}/api/public/store/${STORE_ID}`;
const headers = {
  Authorization: TOKEN,
  "x-store-token": TOKEN,
};

function buildFetchInit(fetchOptions = {}) {
  const init = { headers, ...fetchOptions };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" && !init.signal) {
    init.signal = AbortSignal.timeout(15000);
  }
  return init;
}

// The parsed JSON body, or null when the store isn't configured, the request fails or the
// response isn't ok.
async function getJson(path, fetchOptions) {
  if (!commerceConfigured) return null;
  try {
    const res = await fetch(`${baseURL}${path}`, buildFetchInit(fetchOptions));
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error(`RP Commerce request failed: ${error.message}`);
    return null;
  }
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
    const data = await getJson(`/categories/categoryByUrl?${q}`, fetchOptions);
    return data?.category ?? null;
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
    const data = await getJson(`/products?${q}`, fetchOptions);
    return data ? data.products ?? [] : null;
  },

  async getCategoryById(categoryId, locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({ locale, useFallbackLocale: "true" });
    const data = await getJson(`/categories/${categoryId}?${q}`, fetchOptions);
    return data?.category ?? null;
  },

  async getCategoryFilters(categoryId, locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({ locale, useFallbackLocale: "true" });
    return getJson(`/filters/categories/${categoryId}?${q}`, fetchOptions);
  },

  async getAllCategories(locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({ locale, useFallbackLocale: "true" });
    const data = await getJson(`/categories?${q}`, fetchOptions);
    return data?.categories ?? [];
  },

  async getAllProducts(locale = "en", fetchOptions = {}) {
    const q = new URLSearchParams({ locale, useFallbackLocale: "true" });
    const data = await getJson(`/products?${q}`, fetchOptions);
    return data?.products ?? [];
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
    const data = await getJson(`/products?${q}`, fetchOptions);
    return data ? data.products ?? [] : null;
  },
};

export default RPCommerce;
