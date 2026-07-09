import ProductionView from './ProductionView'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProductionView id={id} />
}
