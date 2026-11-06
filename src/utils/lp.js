export const inLivePreview = () => {
    return process.env.LIVE_PREVIEW_ENABLED === "true" && typeof window !== 'undefined' && window.self !== window.top;
}