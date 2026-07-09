import ProjectDetail from './ProjectDetail'

// Server component — extracts the route param and passes it to the client component.
// Keeping page.tsx as a server component avoids Turbopack's client-manifest mismatch
// that occurs when a "use client" directive lives directly on a dynamic-route page file.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProjectDetail id={id} />
}
