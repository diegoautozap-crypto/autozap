import Pusher from 'pusher-js'

let instance: Pusher | null = null
let subscribedChannel: string | null = null

export function getPusher(): Pusher | null {
  if (instance) return instance
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'sa1'
  if (!key) return null
  instance = new Pusher(key, { cluster })
  return instance
}

export function subscribeTenant(tenantId: string) {
  const pusher = getPusher()
  if (!pusher) return null
  const channelName = `tenant-${tenantId}`
  if (subscribedChannel === channelName) return pusher.channel(channelName)
  if (subscribedChannel) pusher.unsubscribe(subscribedChannel)
  subscribedChannel = channelName
  return pusher.subscribe(channelName)
}

export function disconnectPusher() {
  if (instance) {
    if (subscribedChannel) instance.unsubscribe(subscribedChannel)
    instance.disconnect()
    instance = null
    subscribedChannel = null
  }
}
