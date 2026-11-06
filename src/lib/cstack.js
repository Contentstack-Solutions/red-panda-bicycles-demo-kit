import contentstack from '@contentstack/delivery-sdk';

function deserializeVariantIds (variantsQueryParam) {
  if(!variantsQueryParam) return '';
  return variantsQueryParam
      .split(',')
      .map((variantPair) => `cs_personalize_${variantPair.split('=').join('_')}`)
      .join(',')
}

const stack = contentstack.stack({
  apiKey: process.env.CONTENTSTACK_API_KEY,  
  deliveryToken: process.env.CONTENTSTACK_DELIVERY_TOKEN,
  environment: process.env.CONTENTSTACK_ENVIRONMENT,
  branch: process.env.CONTENTSTACK_BRANCH ? process.env.CONTENTSTACK_BRANCH : 'main',
  host: process.env.CONTENTSTACK_HOST || 'cdn.contentstack.io',
  live_preview: {
    preview_token: process.env.CONTENTSTACK_PREVIEW_TOKEN,
    enable: true,
    host: process.env.CONTENTSTACK_PREVIEW_HOST || 'rest-preview.contentstack.com',
  },
  region: process.env.CONTENTSTACK_REGION || 'us',
});


export function cslp(content, key, index){
  if(!content?.$)
    return {};
  else
    return(content.$[key + index])
}

const ContentstackServer = {
  getElement(id, type, locale, live_preview, variantParam) {
   stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry(id)
        .addParams({ "include_applied_variants": "true" })
        .variants(deserializeVariantIds(variantParam))
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .fetch()
        .then(
          function success(entry) {
            resolve(entry);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            console.error("error", err);
            reject(err);
          }
        );
    });
  },

  getElementWithRefs(id, type, locale, references, live_preview, variantParam) {
   stack.livePreviewQuery(live_preview);
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry(id)
        .includeReference(...references)
        .addParams({ "include_applied_variants": "true" })
        .variants(deserializeVariantIds(variantParam))
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .fetch()
        .then(
          function success(entry) {
            resolve(entry);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            console.error("error", err);
            reject(err);
          }
        );
    });
  },

  getElementByUrl(type, url, locale, live_preview, variantParam) {
   stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry()
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .variants(deserializeVariantIds(variantParam))
        .query()
        .equalTo("url", url)
        .addParams({ "include_applied_variants": "true" })
        .find()
        .then(
          function success(data) {
            resolve(data.entries);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            reject(err);
          }
        );
    });
  },

  getElementByUrlWithRefs(type, url, locale, references, live_preview, variantParam) {
   stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry()
        .includeReference(...references)
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .variants(deserializeVariantIds(variantParam))
        .addParams({ "include_applied_variants": "true" })
        .query({ "url": { $eq: url } })
        .find()
        .then(
          function success(data) {
            resolve(data.entries);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            reject(err);
          }
        );
    });
  },

  getElementByType(type, locale, live_preview, variantParam) {
   stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry()
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .variants(deserializeVariantIds(variantParam))
        .addParams({ "include_applied_variants": "true" })
        .find()
        .then(
          function success(data) {
            resolve(data.entries);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            console.error("error", err);
            reject(err);
          }
        );
    });
  },

  getElementByTypeWithRefs(type, locale, references, live_preview, variantParam) {
   stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry()
        .includeReference(...references)
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .variants(deserializeVariantIds(variantParam))
        .addParams({ "include_applied_variants": "true" })
        .find()
        .then(
          function success(data) {
            resolve(data.entries);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            console.error("error", err);  
            reject(err);
          }
        );
    });
  },

  getElementByTypeByTaxonomy(type, locale, term, live_preview, variantParam) {
   stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry()
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .variants(deserializeVariantIds(variantParam))
        .addParams({ "include_applied_variants": "true" })
        .query({ "taxonomies.article": { $in: term } })
        .find()
        .then(
          function success(data) {
            resolve(data.entries);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            console.error("error", err);
            reject(err);
          }
        );
    });
  },

  getPDPbyProduct(type, url, locale, live_preview, variantParam){
   stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry()
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .variants(deserializeVariantIds(variantParam))
        .addParams({ "include_applied_variants": "true" })
        .query({ "product.data.url": { $eq: url } })
        .find()
        .then(
          function success(data) {
            resolve(data.entries);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            console.error("error", err);
            reject(err);
          }
        );
      })
  },

  getPLPbyCategory(type, url, locale, live_preview, variantParam){
   stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry()
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .variants(deserializeVariantIds(variantParam))
        .addParams({ "include_applied_variants": "true" })
        .query({ "product_category.data.url": { $eq: url } })
        .find()
        .then(
          function success(data) {
            resolve(data.entries);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {
            console.error("error", err);
            reject(err);
          }
        );
      })
  },

  getElementByTypeByTaxonomyLocation(type, locale, term, references, live_preview, variantParam) {
    stack.livePreviewQuery(live_preview ?? {});
    return new Promise((resolve, reject) => {
      stack.contentType(type)
        .entry()
        .includeReference(...references)
        .locale(locale ? locale : "en")
        .includeFallback(true)
        .variants(deserializeVariantIds(variantParam))
        .addParams({ "include_applied_variants": "true" })
        .query({ "taxonomies.locations": { $in: term } })
        .find()
        .then(
          function success(data) {
            resolve(data.entries);
          },
          function empty() {
            resolve(null);
          },
          function error(err) {

            console.error("error", err);
            reject(err);
          }
        );
    });
  },

  getStack() {
    return stack;
  },
};

export default ContentstackServer;