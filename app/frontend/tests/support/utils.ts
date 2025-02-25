// Copyright (C) 2012-2023 Zammad Foundation, https://zammad-foundation.org/

import type { ViewerOptions } from '@shared/composables/useImageViewer'
import type { Ref } from 'vue'
import { nextTick } from 'vue'
import type { MockGraphQLInstance } from './mock-graphql-api'

const state = Symbol('test:state')

interface TestState {
  imageViewerOptions: Ref<ViewerOptions>
}

export const getTestState = (): TestState => {
  return (globalThis as any)[state] || {}
}

export const setTestState = (newState: Partial<TestState>) => {
  ;(globalThis as any)[state] = {
    ...getTestState(),
    ...newState,
  }
}

export const waitForTimeout = async (milliseconds = 0) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

export const waitForNextTick = async (withTimeout = false) => {
  if (withTimeout) {
    await nextTick()

    return new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  }

  return nextTick()
}

export const waitUntil = async (
  condition: () => unknown,
  msThreshold = process.env.CI ? 30_000 : 1_000,
) => {
  // point stack trace to the place where "waitUntil" was called
  const err = new Error('Timeout')
  Error.captureStackTrace(err, waitUntil)
  return new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const max = start + msThreshold
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval)
        resolve()
      }
      if (max < Date.now()) {
        clearInterval(interval)
        reject(err)
      }
    }, 30)
  })
}

export const waitUntilApisResolved = (...mockApis: MockGraphQLInstance[]) => {
  return waitUntil(() => mockApis.every((mock) => mock.calls.resolve))
}

// The apollo cache always asks for a field, even if it's marked as optional
// this function returns a proxy that will return "null" on properties not defined
// in the initial object.
export const nullableMock = <T extends object>(obj: T): T => {
  const skipProperties = new Set(['_id', 'id', Symbol.toStringTag])

  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (!Reflect.has(target, prop) && !skipProperties.has(prop)) {
        return null
      }
      const value = Reflect.get(target, prop, receiver)
      if (Array.isArray(value)) {
        return value.map(nullableMock)
      }
      if (typeof value === 'object' && value !== null) {
        return nullableMock(value)
      }
      return value
    },
  })
}
