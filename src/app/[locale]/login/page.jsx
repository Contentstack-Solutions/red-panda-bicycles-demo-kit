import ClubLogin from "@/components/ClubLogin";
import { DEMO_MEMBER } from "@/lib/demoMember";
import { safeReturnTo } from "@/lib/memberSession";

export const metadata = {
  title: "Sign in | Amsterdam BC",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ params, searchParams }) {
  const { locale } = await params;
  const { returnTo } = await searchParams;
  return <ClubLogin member={DEMO_MEMBER} returnTo={safeReturnTo(returnTo, locale)} />;
}
