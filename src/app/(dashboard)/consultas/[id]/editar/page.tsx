import FormularioConsulta from '@/components/consultations/FormularioConsulta';

export default async function EditarConsultaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormularioConsulta consultaId={id} />;
}
