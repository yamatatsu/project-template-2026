import { describe, expect, it } from 'vitest'

import { app } from './app.ts'

describe('GET /hello-world', () => {
  it('responds with the hello world message as JSON', async () => {
    const res = await app.request('/hello-world')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'hello world' })
  })
})
