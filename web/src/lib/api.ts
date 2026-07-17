export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // non-JSON error body — keep the status message
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

export function apiGet<T>(path: string): Promise<T> {
  return fetch(path).then((res) => parse<T>(res))
}

export function apiSend<T>(method: string, path: string, body: unknown): Promise<T> {
  return fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => parse<T>(res))
}

export function apiSendForm<T>(method: string, path: string, form: FormData): Promise<T> {
  // No Content-Type header — the browser sets the multipart boundary.
  return fetch(path, { method, body: form }).then((res) => parse<T>(res))
}
