export type WorkspaceMode = 'generation' | 'library' | 'print'

// Shared management pages carry the mode in the URL so reload and Back retain it.
export function workspaceMode(pathname: string, search: string): WorkspaceMode {
  if (pathname === '/print') return 'print'
  if (pathname === '/assemble' || pathname.startsWith('/assemble/') || pathname === '/card-templates') return 'library'
  if (['/factions', '/card-types'].includes(pathname) && new URLSearchParams(search).get('mode') === 'library') return 'library'
  return 'generation'
}
export function workspaceLink(path: string, mode: WorkspaceMode) {
  return mode === 'library' && ['/factions', '/card-types'].includes(path) ? `${path}?mode=library` : path
}
