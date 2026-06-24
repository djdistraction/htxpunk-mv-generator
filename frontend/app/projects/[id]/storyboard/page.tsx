import StoryboardView from './StoryboardView'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <StoryboardView id={id} />
}
