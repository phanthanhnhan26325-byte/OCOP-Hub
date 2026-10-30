export async function SiteHeader() {
  const { getSessionUser } = await import('@/lib/rbac');
  const { SiteHeaderNav } = await import('@/components/shared/SiteHeaderNav');
  const user = await getSessionUser();
  return <SiteHeaderNav user={user} />;
}
