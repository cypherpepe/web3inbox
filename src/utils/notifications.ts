import { NotifyClient } from '@walletconnect/notify-client'
import { getFirebaseToken } from './firebase'
import { useState, useEffect } from 'react'
import { getDbEchoRegistrations, getDbSymkeyStore } from './idb'

declare const __VITE_PROJECT_ID__: string
const ECHO_URL = 'https://echo.walletconnect.com'

const setupSubscriptionSymkey = async (topic: string, symkey: string) => {
  const [, putSymkey] = await getDbSymkeyStore()

  await putSymkey(topic, symkey)
}

export const setupSubscriptionsSymkeys = async (topicSymkeyEntries: [string, string][]) => {
  topicSymkeyEntries.forEach(([topic, symkey]) => setupSubscriptionSymkey(topic, symkey))

  for (const [topic, symkey] of topicSymkeyEntries) {
    setupSubscriptionSymkey(topic, symkey)
  }
}

const callEcho = async (clientId: string, token: string) => {
  const [getRegistrationToken, putRegistrationToken] = await getDbEchoRegistrations()

  // Check for existing registration to prevent spamming echo
  const existingRegistrationToken = await getRegistrationToken(clientId)

  // Already registered device.
  // No need to spam echo
  if (existingRegistrationToken === token) {
    // DO not check for existing registration token.
    // Echo is meant to be called repeatedly to refresh PN token
    console.log(
      'main-sw > registerWithEcho > user already registered with token',
      token,
      're-registering anyway'
    )
  }

  // coming from `define` in vite.config.js
  const projectId = __VITE_PROJECT_ID__

  const echoUrl = `${ECHO_URL}/${projectId}/clients`

  const echoResponse = await fetch(echoUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      type: 'FCM',
      token
    })
  })

  console.log({ echoResponse: await echoResponse.text(), status: echoResponse.status })

  // Is a 200 type response. Redirects (300s) shouldn't occur
  if (echoResponse.status >= 200 && echoResponse.status < 300) {
    // Store info to prevent re-registration
    await putRegistrationToken(clientId, token)
  }
}


export const notificationsEnabledInBrowser = () => {
  return 'Notification' in window
}

export const userEnabledNotification = () => {
  if (notificationsEnabledInBrowser()) {
    return Notification?.permission === 'granted'
  }
  return false
}

export const useNotificationPermissionState = () => {
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(
    userEnabledNotification()
  )

  useEffect(() => {
    navigator.permissions?.query({ name: 'notifications' }).then(permissionStatus => {
      permissionStatus.onchange = () => {
        setNotificationPermissionGranted(userEnabledNotification())
      }
    })
  }, [])

  return notificationPermissionGranted
}

/*
 * Trigger notification dialogue if supported
 * Returns true if permissions were granted
 */
export const requireNotifyPermission = async () => {
  if (!notificationsEnabledInBrowser()) {
    console.error('This browser does not support desktop push notifications')
    return false
  }

  switch (Notification.permission) {
    case 'granted':
      return true
    case 'denied':
      console.error('User denied permissions')
      return false
    default:
      return (await Notification.requestPermission()) === 'granted'
  }
}

export const registerWithEcho = async (notifyClient: NotifyClient) => {
  const isSecureContext = window.location.protocol === 'https:'

  console.log('>> registerWithEcho')

  console.log('>> registerWithEcho: isSecureContext :', isSecureContext)

  if (!isSecureContext) {
    throw new Error('Can not set up notification in unsecure context')
  }

  const clientId = await notifyClient.core.crypto.getClientId()

  console.log('>> registerWithEcho: clientId :', clientId)

  const token = await getFirebaseToken()

  console.log('>> registerWithEcho: token :', token)

  await callEcho(clientId, token);

  console.log('>> registerWithEcho: called echo')
}
