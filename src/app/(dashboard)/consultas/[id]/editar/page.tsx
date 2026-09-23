import { redirect } from 'next/navigation';

export default async function EditarConsultaRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/consultas/${id}`);
}
