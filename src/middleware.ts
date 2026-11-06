import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { initializePersonalize } from './lib/cspersonalize';
import { personalizeProjectUid } from './lib/personalizeProject';

const intlMiddleware = createMiddleware({
  // A list of all locales that are supported
  locales: ['en', 'es', 'fr', 'de'],

  // Used when no locale matches
  defaultLocale: 'en',
  //localeDetection: false
});

export default async function middleware(req: NextRequest) {
  if (!process.env.HOSTING || (process.env.HOSTING && process.env.HOSTING !== 'launch')) {
    // R37: CONTENTSTACK_PERSONALIZATION is the project UID; unset or "true" falls back to CONTENTSTACK_PERSONALIZE_PROJECT_UID.
    const projectUid = personalizeProjectUid({
      CONTENTSTACK_PERSONALIZATION: process.env.CONTENTSTACK_PERSONALIZATION,
      CONTENTSTACK_PERSONALIZE_PROJECT_UID: process.env.CONTENTSTACK_PERSONALIZE_PROJECT_UID,
    }) as string;

    const { variantParam, personalize } = await initializePersonalize(req, process.env.CONTENTSTACK_PERSONALIZE_EDGE_API_URL, projectUid);

    // For non-API routes, we must rewrite the URL to support next-intl
    if (!req.nextUrl.pathname.startsWith('/api')) {
      const parsedUrl = new URL(req.url);
      // parsedUrl.searchParams.set(personalize.VARIANT_QUERY_PARAM, variantParam);
      const newReq = new NextRequest(parsedUrl.toString(), req);
      newReq.headers.set('x-personalize-variants', variantParam || '');
      const response = intlMiddleware(newReq);
      personalize?.addStateToResponse(response);
      return response;
    }


    // For API routes, it's more reliable to pass the variants via headers.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-personalize-variants', variantParam || '');

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });


    // add cookies to the response
    personalize?.addStateToResponse(response);


    return response;
    
  }

  if (req.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: [
    '/((?!_next|_vercel|.*\\..*).*)',
  ]
};