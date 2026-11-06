import Personalize from '@contentstack/personalize-edge-sdk';

export const initializePersonalize = async (request, CONTENTSTACK_PERSONALIZE_EDGE_API_URL, CONTENTSTACK_PERSONALIZE_PROJECT_UID) => {
    try {
        // Check if personalization is properly configured
        if (!CONTENTSTACK_PERSONALIZE_PROJECT_UID || 
            CONTENTSTACK_PERSONALIZE_PROJECT_UID === 'null' || 
            CONTENTSTACK_PERSONALIZE_PROJECT_UID === 'undefined' ||
            CONTENTSTACK_PERSONALIZE_PROJECT_UID.trim() === '') {
            console.warn('CONTENTSTACK_PERSONALIZATION is not properly configured. Personalization features will be disabled.');
            return { variantParam: null, personalize: null, error: null };
        }

        if (CONTENTSTACK_PERSONALIZE_EDGE_API_URL) {
            const url = CONTENTSTACK_PERSONALIZE_EDGE_API_URL.includes('https://') 
                ? CONTENTSTACK_PERSONALIZE_EDGE_API_URL 
                : `https://${CONTENTSTACK_PERSONALIZE_EDGE_API_URL}`;
            Personalize.setEdgeApiUrl(url);
        }

        const personalize = await Personalize.init(CONTENTSTACK_PERSONALIZE_PROJECT_UID, {
            request,
        });

        const variantParam = personalize.getVariantParam();

        return { variantParam, personalize };
    } catch (error) {
        return { variantParam: null, personalize: null, error: error };
    }
};