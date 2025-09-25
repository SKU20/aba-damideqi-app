  import { io } from 'socket.io-client'

  // Try to derive a base URL from envs; fallback to localhost:3000
  const deriveBaseUrl = () => {
    const fromSocket = process.env.EXPO_PUBLIC_SOCKET_URL
    if (fromSocket) return fromSocket

    const fromApiHome = process.env.EXPO_PUBLIC_API_URL_HOME
    if (fromApiHome) {
      // Strip trailing /api or path
      try {
        const url = new URL(fromApiHome)
        return `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`
      } catch {
        // fallback simple strip
        return fromApiHome.replace(/\/api.*/, '')
      }
    }

    const fromApi = process.env.EXPO_PUBLIC_API_BASE
    if (fromApi) return fromApi

    return 'http://localhost:3000'
  }

  const baseUrl = deriveBaseUrl()
  console.log('[socket] baseUrl =', baseUrl)

  const socket = io(baseUrl, {
    // Allow fallback when websockets are blocked/unstable (mobile hotspot, proxies)
    transports: ['websocket', 'polling'],
    path: '/socket.io',
    timeout: 10000,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  })

  socket.on('connect', () => {
    console.log('[socket] connected', socket.id, 'to', baseUrl)
  })

  socket.on('connect_error', (err) => {
    console.warn('[socket] connect_error', err?.message || err)
  })

  socket.on('disconnect', (reason) => {
    console.log('[socket] disconnected:', reason)
  })

  export default socket
