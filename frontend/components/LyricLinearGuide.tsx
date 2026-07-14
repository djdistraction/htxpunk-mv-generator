'use client'

import Link from 'next/link'
import { GuideStep, GuideStepState, buildLyricLinearGuide } from '@/lib/lyricGuide'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95Progress,
  Win95StatusBadge,
} from '@/components/win95/Win95Primitives'

function stateBadge(state: GuideStepState): { status: 'ok' | 'warn' | 'error' | 'info' | 'muted' | 'running'; label: string } {
  switch (state) {
    case 'done':
      return { status: 'ok', label: 'Done' }
    case 'current':
      return { status: 'warn', label: 'Do this now' }
    case 'running':
      return { status: 'running', label: 'Working…' }
    case 'failed':
      return { status: 'error', label: 'Failed' }
    default:
      return { status: 'muted', label: 'Later' }
  }
}

export default function LyricLinearGuide({
  projectId,
  project,
  runningAction,
  onRun,
  onApprove,
  onRetryProject,
}: {
  projectId: string
  project: any
  runningAction: string | null
  onRun: (action: string, confirmMessage?: string) => void
  onApprove: (sectionKey: string) => void
  onRetryProject?: () => void
}) {
  const guide = buildLyricLinearGuide(project)
  const current = guide.steps[guide.currentIndex]
  const failed = project.stage === 'error'
  const errorText = project.error_message || project.section_statuses?.final_video?.error || ''

  const handleAction = (step: GuideStep) => {
    const action = step.action
    if (!action) return
    if (action.run?.startsWith('approve:')) {
      onApprove(action.run.slice('approve:'.length))
      return
    }
    if (action.run) {
      onRun(action.run, action.confirm)
      return
    }
  }

  const actionHref = (href: string) =>
    href.startsWith('/') ? href : `/projects/${projectId}/${href}`

  return (
    <div className="win95-stack">
      <Win95GroupBox title="Where you are">
        <div className="win95-strong" style={{ fontSize: 14, marginBottom: 6 }}>
          {guide.headline}
        </div>
        <p className="win95-muted" style={{ marginTop: 0, marginBottom: 10, lineHeight: 1.45 }}>
          {guide.instruction}
        </p>
        <Win95Progress value={guide.progress} label={`${guide.progress}% · ${guide.steps.filter(s => s.state === 'done').length}/${guide.steps.length} steps done`} />
      </Win95GroupBox>

      {failed && errorText && (
        <Win95Alert tone="error" title="Last error (why generation failed)">
          <div style={{ fontFamily: 'var(--win-mono)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>
            {errorText}
          </div>
          <div className="win95-muted" style={{ marginBottom: 8 }}>
            Common fixes: run <code>cd remotion-composer && npm install</code>, ensure Node.js is on PATH,
            then use the Retry button on the current step (or Retry failed step below).
          </div>
          {onRetryProject && (
            <Win95Button onClick={onRetryProject} disabled={Boolean(runningAction)}>
              {runningAction === 'retry' ? 'Retrying…' : 'Clear error & resume'}
            </Win95Button>
          )}
        </Win95Alert>
      )}

      {current?.action && (
        <Win95GroupBox title="Next action">
          <p style={{ marginTop: 0 }}>{current.description}</p>
          {current.detail && <p className="win95-muted">{current.detail}</p>}
          <div className="win95-row">
            {current.action.href ? (
              <Link
                href={actionHref(current.action.href)}
                className="win95-btn win95-btn-link win95-btn-primary"
              >
                {current.action.label}
              </Link>
            ) : (
              <Win95Button
                variant="primary"
                disabled={Boolean(runningAction)}
                onClick={() => handleAction(current)}
              >
                {runningAction ? 'Working…' : current.action.label}
              </Win95Button>
            )}
            {project.base_video_url || project.video_url ? (
              <Link href={`/projects/${projectId}/production`} className="win95-btn win95-btn-link">
                Open Production
              </Link>
            ) : null}
          </div>
        </Win95GroupBox>
      )}

      <Win95GroupBox title="Full checklist (top to bottom — do not skip ahead)">
        <div className="win95-stack" style={{ gap: 6 }}>
          {guide.steps.map(step => {
            const badge = stateBadge(step.state)
            const isFocus = step.state === 'current' || step.state === 'running' || step.state === 'failed'
            return (
              <div
                key={step.id}
                className={isFocus ? 'win95-outset' : 'win95-inset'}
                style={{
                  padding: 10,
                  background: isFocus ? 'var(--win-face-light)' : undefined,
                }}
              >
                <div className="win95-row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="win95-strong">
                    {step.number}. {step.title}
                  </span>
                  <Win95StatusBadge status={badge.status}>{badge.label}</Win95StatusBadge>
                </div>
                <div className="win95-muted" style={{ fontSize: 11, marginBottom: 4 }}>
                  {step.description}
                </div>
                {step.detail && (
                  <div style={{ fontSize: 11, marginBottom: step.action && isFocus ? 8 : 0, whiteSpace: 'pre-wrap' }}>
                    {step.detail}
                  </div>
                )}
                {isFocus && step.action && (
                  <div className="win95-row">
                    {step.action.href ? (
                      <Link
                        href={actionHref(step.action.href)}
                        className="win95-btn win95-btn-link win95-btn-primary"
                      >
                        {step.action.label}
                      </Link>
                    ) : (
                      <Win95Button
                        variant="primary"
                        disabled={Boolean(runningAction)}
                        onClick={() => handleAction(step)}
                      >
                        {runningAction ? 'Working…' : step.action.label}
                      </Win95Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Win95GroupBox>

      <p className="win95-muted" style={{ fontSize: 11 }}>
        Lyric Video path only: no treatment, elements, or storyboard. Project ID: {projectId}
      </p>
    </div>
  )
}
