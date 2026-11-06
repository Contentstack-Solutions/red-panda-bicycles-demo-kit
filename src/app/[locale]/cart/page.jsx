import CartView from "@/components/CartView";

export const metadata = {
  title: "Your Cart | Amsterdam BC",
  robots: { index: false, follow: false },
};

export default async function CartPage({ params }) {
  const { locale } = await params;
  return <CartView locale={locale} />;
}
