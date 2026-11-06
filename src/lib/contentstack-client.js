"use client";
import Contentstack from 'contentstack';
import { inLivePreview } from '@/utils/lp';
import {addEditableTags} from '@contentstack/utils';

const Stack = Contentstack.Stack({
    api_key: process.env.CONTENTSTACK_API_KEY,
    delivery_token: process.env.CONTENTSTACK_DELIVERY_TOKEN,
    environment: process.env.CONTENTSTACK_ENVIRONMENT,
    branch: process.env.CONTENTSTACK_BRANCH,
    host: process.env.CONTENTSTACK_HOST || 'cdn.contentstack.io',
    live_preview: {
        preview_token: process.env.CONTENTSTACK_PREVIEW_TOKEN,
        enable: true,
        host: process.env.CONTENTSTACK_PREVIEW_HOST || 'rest-preview.contentstack.com',
    },
    region: process.env.CONTENTSTACK_REGION || 'us'
})

const getLocaleForURL = () => {
    if (typeof window === 'undefined') return 'en'
    return window.location.pathname?.split('/').filter(Boolean)[0]
}

let ContentstackLivePreview = null;

if (process.env.LIVE_PREVIEW_ENABLED === "true") {
//dynamic import for live preview if in live preview
const LivePreviewModule = await import('@contentstack/live-preview-utils');
ContentstackLivePreview = LivePreviewModule.default;

ContentstackLivePreview.init({
    enable: 'true',
    ssr: false,
    mode: 'builder',
    editInVisualBuilderButton: {
        enable: false,
    },
    stackSdk: Stack,
    clientUrlParams: {
        protocol: "https",
        host: process.env.CONTENTSTACK_APP_HOST || "app.contentstack.com",
        port: 443,
    },
    stackDetails: {
        apiKey: process.env.CONTENTSTACK_API_KEY,
        environment: process.env.CONTENTSTACK_ENVIRONMENT,
        branch: process.env.CONTENTSTACK_BRANCH ? process.env.CONTENTSTACK_BRANCH : 'main',
        locale: getLocaleForURL()
        },
    });
}

export const cslp = (content, key, index) => {
    if (!content?.$)
        return {};
    else
        return (content.$[key + index])
}

const getSearchQueryParams = () => {
    if (typeof window === 'undefined') return {};
    return Object.fromEntries(new URLSearchParams(window.location.search));
};

export const ContentstackClient = {
    onEntryChange: function(callback) {
        if (inLivePreview() && ContentstackLivePreview) {
            return ContentstackLivePreview.onEntryChange(callback);
        } else {
            return callback();
        }
    },
    getElement: async function (id, type, locale, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview()) {
            while (!Stack.live_preview?.hash && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getElement`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, type, locale, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview())
            addEditableTags(data, type, true, locale);
        return data;
    },

    getElementWithRefs: async function (id, type, locale, references, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview()) {
            while (!Stack.live_preview?.hash && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getElementWithRefs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, type, locale, references, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview())
            addEditableTags(data, type, true, locale);
        return data;
    },

    getElementByUrl: async function (type, url, locale, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview()) {
            while (!Stack.live_preview?.hash && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getElementByUrl`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, url, locale, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview() && data?.[0])
            addEditableTags(data[0], type, true, locale);
        return data;
    },

    getElementByUrlWithRefs: async function (type, url, locale, references, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview() && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
            while (!Stack.live_preview?.hash) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getElementByUrlWithRefs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, url, locale, references, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview() && data?.[0])
            addEditableTags(data[0], type, true, locale);
        return data;
    },

    getElementByType: async function (type, locale, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview() && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
            while (!ContentstackLivePreview?.hash) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getElementByType`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, locale, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview()) {
            for (let i = 0; i < data.length; i++) {
                addEditableTags(data[i], type, true, locale);
            }
        }
        return data;
    },

    getElementByTypeWithRefs: async function (type, locale, references, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview() && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
            while (!Stack.live_preview?.hash) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getElementByTypeWithRefs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, locale, references, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview()) {
            for (let i = 0; i < data.length; i++) {
                addEditableTags(data[i], type, true, locale);
            }
        }
        return data;
    },

    getElementByTypeByTaxonomy: async function (type, locale, term, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview() && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
            while (!Stack.live_preview?.hash) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getElementByTypeByTaxonomy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, locale, term, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview()) {
            for (let i = 0; i < data.length; i++) {
                addEditableTags(data[i], type, true, locale);
            }
        }
        return data;
    },

    getPDPbyProduct: async function (type, url, locale, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview() && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
            while (!Stack.live_preview?.hash) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getPDPbyProduct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, url, locale, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview() && data?.[0])
            addEditableTags(data[0], type, true, locale);
        return data;
    },

    getPLPbyCategory: async function (type, url, locale, initialData) {
        if (inLivePreview()) {
            while (!Stack.live_preview?.hash) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getPLPbyCategory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, url, locale, live_preview: (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview() && data?.[0])
            addEditableTags(data[0], type, true, locale);
        return data;
    },

    getElementByTypeByTaxonomyLocation: async function (type, locale, term, references, initialData) {
        const searchQueryParams = getSearchQueryParams();
        if (inLivePreview() && !(searchQueryParams.live_preview || searchQueryParams.hash)) {
            while (!Stack.live_preview?.hash) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        let data = null;
        if (initialData && !inLivePreview()) {
            data = initialData;
        } else {
            const res = await fetch(`/api/contentstack/getElementByTypeByTaxonomyLocation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, locale, term, references, live_preview: (searchQueryParams.live_preview || searchQueryParams.hash) ? searchQueryParams : (Stack.live_preview.hash) ? Stack.live_preview : null })
            });
            if(res.ok) {
                data = await res.json();
            } else {
                data = null;
            }
        }
        if (data && inLivePreview()) {
            for (let i = 0; i < data[0].length; i++) {
                addEditableTags(data[0][i], type, true, locale);
            }
        }
        return data;
    }

}