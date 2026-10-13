import FormularioCirugia from '@/components/cirugia/FormularioCirugia';

/** Edición de cirugía: el mismo formulario que la alta, con los datos ya llenos. */
export default async function EditarCirugiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FormularioCirugia cirugiaId={id} />;
}
