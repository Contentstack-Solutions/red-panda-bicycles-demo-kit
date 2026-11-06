
import { cache } from "react";
import { cookies, headers } from "next/headers";
import ContentstackServer from "@/lib/cstack";
import { fetchHomepageEntry } from "@/lib/homepageEntry";
import { slimLinkedPages } from "@/lib/slimReferences";
import CartProvider from "@/context/cart.context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";
import { MEMBER_COOKIE, decodeMember } from "@/lib/memberSession";
import { DEMO_MEMBER } from "@/lib/demoMember";

const fetchHeaderData = cache(async (locale) => {
  const headersList = await headers();
  const variantParam = headersList.get('x-personalize-variants');
  try {
    const data = await ContentstackServer.getElementByTypeWithRefs("header", locale, ["menu_items.page"], {}, variantParam);
    return slimLinkedPages(data);
  } catch (error) {
    console.error("Failed to fetch header entry", error);
    return null;
  }
});

const fetchFooterData = cache(async (locale) => {
  const headersList = await headers();
  const variantParam = headersList.get('x-personalize-variants');
  try {
    const data = await ContentstackServer.getElementByTypeWithRefs("footer", locale, ["link_columns.column.page"], {}, variantParam);
    return slimLinkedPages(data);
  } catch (error) {
    console.error("Failed to fetch footer entry", error);
    return null;
  }
});

export const generateMetadata = async ({ params }) => {
  const { locale } = await params;
  const data = await fetchHomepageEntry(locale);
  const entry = data?.[0];

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
  }
};

export default async function RootLayout({
  children,
  params,
}) {
  const { locale } = await params;
  const [headerData, footerData] = await Promise.all([
    fetchHeaderData(locale),
    fetchFooterData(locale),
  ]);
  const cookieStore = await cookies();
  const member = decodeMember(cookieStore.get(MEMBER_COOKIE)?.value);

  return (
    <CartProvider memberEmail={member ? DEMO_MEMBER.email : null}>
      <div className="flex min-h-screen flex-col">
        <Header locale={locale} initialData={headerData} member={member} />
        <main className="flex-1">{children}</main>
        <Footer locale={locale} initialData={footerData} />
      </div>
      <CartDrawer locale={locale} />
    </CartProvider>
  );
}
