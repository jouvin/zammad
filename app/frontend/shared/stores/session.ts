// Copyright (C) 2012-2023 Zammad Foundation, https://zammad-foundation.org/

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { cloneDeep } from 'lodash-es'
import { useSessionIdLazyQuery } from '@shared/graphql/queries/sessionId.api'
import { useCurrentUserLazyQuery } from '@shared/graphql/queries/currentUser.api'
import {
  QueryHandler,
  SubscriptionHandler,
} from '@shared/server/apollo/handler'
import type { UserData } from '@shared/types/store'
import hasPermission from '@shared/utils/hasPermission'
import type { RequiredPermission } from '@shared/types/permission'
import { useCurrentUserUpdatesSubscription } from '@shared/graphql/subscriptions/currentUserUpdates.api'
import type {
  CurrentUserQuery,
  CurrentUserQueryVariables,
  CurrentUserUpdatesSubscription,
  CurrentUserUpdatesSubscriptionVariables,
  SessionIdQuery,
  SessionIdQueryVariables,
} from '@shared/graphql/types'
import useFingerprint from '@shared/composables/useFingerprint'
import testFlags from '@shared/utils/testFlags'
import log from '@shared/utils/log'
import { useLocaleStore } from './locale'

let sessionIdQuery: QueryHandler<SessionIdQuery, SessionIdQueryVariables>

const getSessionIdQuery = () => {
  if (sessionIdQuery) return sessionIdQuery

  const { fingerprint } = useFingerprint()

  sessionIdQuery = new QueryHandler(
    useSessionIdLazyQuery({
      fetchPolicy: 'network-only',
      context: {
        error: {
          logLevel: 'silent',
        },
        headers: {
          'X-Browser-Fingerprint': fingerprint.value,
        },
      },
    }),
    {
      errorShowNotification: false,
    },
  )

  return sessionIdQuery
}

let currentUserQuery: QueryHandler<CurrentUserQuery, CurrentUserQueryVariables>

const getCurrentUserQuery = () => {
  if (currentUserQuery) return currentUserQuery

  currentUserQuery = new QueryHandler(
    useCurrentUserLazyQuery({ fetchPolicy: 'network-only' }),
  )

  return currentUserQuery
}

export const useSessionStore = defineStore(
  'session',
  () => {
    const id = ref<Maybe<string>>(null)
    const initialized = ref(false)

    const checkSession = async (): Promise<string | null> => {
      const sessionIdQuery = getSessionIdQuery()
      const { data: result } = await sessionIdQuery.query()

      // Refresh the current sessionId state.
      id.value = result?.sessionId || null

      return id.value
    }

    const user = ref<Maybe<UserData>>(null)

    let currentUserUpdateSubscription: SubscriptionHandler<
      CurrentUserUpdatesSubscription,
      CurrentUserUpdatesSubscriptionVariables
    >
    const getCurrentUser = async (): Promise<Maybe<UserData>> => {
      if (currentUserQuery && !user.value) {
        currentUserQuery.start()
      }

      const userQuery = getCurrentUserQuery()

      const { data: result } = await userQuery.query()

      user.value = cloneDeep(result?.currentUser) || null

      log.debug('currentUserUpdate', user.value)

      // Check if the locale is different, then a update is needed.
      const locale = useLocaleStore()
      const userLocale = user.value?.preferences?.locale as string

      if (
        userLocale &&
        (!locale.localeData || userLocale !== locale.localeData.locale)
      ) {
        await locale.setLocale(userLocale)
      }

      if (user.value) {
        if (!currentUserUpdateSubscription) {
          currentUserUpdateSubscription = new SubscriptionHandler(
            useCurrentUserUpdatesSubscription(() => ({
              userId: (user.value as UserData)?.id,
            })),
          )

          currentUserUpdateSubscription.onResult((result) => {
            const updatedUser = result.data?.userUpdates.user
            if (!updatedUser) {
              testFlags.set('useCurrentUserUpdatesSubscription.subscribed')
            } else {
              user.value = updatedUser
            }
          })
        } else {
          currentUserUpdateSubscription.start()
        }

        testFlags.set('useSessionUserStore.getCurrentUser.loaded')
      }

      return user.value
    }

    const resetCurrentSession = () => {
      if (currentUserUpdateSubscription) currentUserUpdateSubscription.stop()
      if (currentUserQuery) currentUserQuery.stop()

      id.value = null
      user.value = null
    }

    const userHasPermission = (
      requiredPermission: RequiredPermission,
    ): boolean => {
      return hasPermission(
        requiredPermission,
        user.value?.permissions?.names || [],
      )
    }

    // In case of unauthenticated users, current user ID may be an empty string.
    //   Use with care.
    const userId = computed(() => user.value?.id || '')

    return {
      id,
      initialized,
      checkSession,
      user,
      userId,
      getCurrentUser,
      resetCurrentSession,
      hasPermission: userHasPermission,
    }
  },
  {
    requiresAuth: false,
  },
)
