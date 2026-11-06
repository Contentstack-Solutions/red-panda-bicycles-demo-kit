import { cache } from "react";
import { headers } from "next/headers";
import { Fraunces, Work_Sans } from "next/font/google";
import "./globals.css";
import ContentstackServer from "@/lib/cstack";
import { PersonalizeProvider } from "@/context/personalize.context";
import { personalizeProjectUid } from '@/lib/personalizeProject';
import { LyticsTracking } from "@/context/lyticsTracking";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600", "700"],
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
});

const fetchData = cache(async (locale) => {
  const headersList = await headers();
  const variantParam = headersList.get('x-personalize-variants');
  // example of how to fetch seo metadata from contentstack, you can create a new content type for seo metadata and use it like this:
  const data = await ContentstackServer.getElementByUrl("seo", "/homepage", locale, {}, variantParam);
  return data;
});

export const generateMetadata = async ({ params }) => {
  const { locale } = await params;
  const data = await fetchData(locale);
  const entry = data?.[0]?.[0];

  return {
    title: entry?.seo?.title,
    description: entry?.seo?.description,
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: entry?.seo?.og_meta_tags?.title,
      description: entry?.seo?.og_meta_tags?.description,
      images: entry?.seo?.og_meta_tags?.image,
    },
    icons: {
      icon: "/red-panda-bicycles-favicon.png",
    },
  }
};

export default async function RootLayout({
  children,
  params,
}) {
  const { locale } = await params;
  
  return (
    <html lang={locale} className={`${fraunces.variable} ${workSans.variable}`}>
      <body className="font-sans antialiased">
        {process.env.LYTICS_TAG && <LyticsTracking />}
        {personalizeProjectUid({
          CONTENTSTACK_PERSONALIZATION: process.env.CONTENTSTACK_PERSONALIZATION,
          CONTENTSTACK_PERSONALIZE_PROJECT_UID: process.env.CONTENTSTACK_PERSONALIZE_PROJECT_UID,
        }) ? <PersonalizeProvider>
          {children}
        </PersonalizeProvider> : <>{children}</>}
      </body>
    </html>
  );
}
