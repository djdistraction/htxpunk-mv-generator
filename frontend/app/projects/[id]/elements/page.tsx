import ElementsList from './ElementsList'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ElementsList id={id} />
}
