import { redirect } from "next/navigation";

export default async function LegacyGroupDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/groups/${id}`);
}
