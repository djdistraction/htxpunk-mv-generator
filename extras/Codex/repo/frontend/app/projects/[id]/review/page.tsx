import ReviewDetail from './ReviewDetail'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ReviewDetail id={id} />
}
