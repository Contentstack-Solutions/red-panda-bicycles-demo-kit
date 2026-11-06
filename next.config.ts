import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
    env:{
        CONTENTSTACK_API_KEY: process.env.CONTENTSTACK_API_KEY,
        CONTENTSTACK_DELIVERY_TOKEN: process.env.CONTENTSTACK_DELIVERY_TOKEN,
        CONTENTSTACK_ENVIRONMENT: process.env.CONTENTSTACK_ENVIRONMENT,
        CONTENTSTACK_BRANCH: process.env.CONTENTSTACK_BRANCH,
        CONTENTSTACK_HOST: process.env.CONTENTSTACK_HOST,
        CONTENTSTACK_REGION: process.env.CONTENTSTACK_REGION,
        CONTENTSTACK_PREVIEW_TOKEN: process.env.CONTENTSTACK_PREVIEW_TOKEN,
        CONTENTSTACK_PREVIEW_HOST: process.env.CONTENTSTACK_PREVIEW_HOST,
        CONTENTSTACK_APP_HOST: process.env.CONTENTSTACK_APP_HOST,
        CONTENTSTACK_PERSONALIZATION: process.env.CONTENTSTACK_PERSONALIZATION,
        // Not secret: the site falls back to it when CONTENTSTACK_PERSONALIZATION is unset or "true" (R37).
        CONTENTSTACK_PERSONALIZE_PROJECT_UID: process.env.CONTENTSTACK_PERSONALIZE_PROJECT_UID,
        CONTENTSTACK_PERSONALIZE_EDGE_API_URL: process.env.CONTENTSTACK_PERSONALIZE_EDGE_API_URL,
        LYTICS_TAG: process.env.LYTICS_TAG,
        LIVE_PREVIEW_ENABLED: process.env.LIVE_PREVIEW_ENABLED,
        HOSTING: process.env.HOSTING,
        RED_PANDA_COMMERCE_API_URL: process.env.RED_PANDA_COMMERCE_API_URL,
        RED_PANDA_COMMERCE_STPRE_ID: process.env.RED_PANDA_COMMERCE_STPRE_ID,
        // Exposed to the browser on purpose: src/context/cart.context.js ("use client")
        // sends it as the Authorization header and in the checkout hash. It is a
        // storefront token, not a write token; never add management tokens here.
        RED_PANDA_COMMERCE_STPRE_TOKEN: process.env.RED_PANDA_COMMERCE_STPRE_TOKEN,
        // Not secret: the demo persona's email and the deployed site URL.
        DEMO_PERSONA_EMAIL: process.env.DEMO_PERSONA_EMAIL,
        SITE_URL: process.env.SITE_URL,
    }
};

export default withNextIntl(nextConfig);
