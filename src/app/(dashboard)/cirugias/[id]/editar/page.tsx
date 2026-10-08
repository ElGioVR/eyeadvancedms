import { redirect } from 'next/navigation';

/** La edición ahora vive en el mismo detalle de la cirugía; esta ruta solo redirige. */
export default async function EditarCirugiaRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/cirugias/${id}`);
}
