import TreatmentDetail from './TreatmentDetail'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <TreatmentDetail id={id} />
}
