import type { IChannelAdapter, ChannelType } from './IChannelAdapter'
import { gupshupAdapter } from './GupshupAdapter'
import { evolutionAdapter } from './EvolutionAdapter'
import { instagramAdapter } from './InstagramAdapter'
import { messengerAdapter } from './MessengerAdapter'
import { AppError } from '@autozap/utils'

// ─── ChannelRouter ────────────────────────────────────────────────────────────
// Registry of all available adapters.
// Add new channels here — nothing else in the system needs to change.

class ChannelRouter {
  private adapters = new Map<ChannelType, IChannelAdapter>()

  constructor() {
    this.register(gupshupAdapter)
    this.register(evolutionAdapter)
    this.register(instagramAdapter)
    this.register(messengerAdapter)
  }

  register(adapter: IChannelAdapter): void {
    this.adapters.set(adapter.channelType, adapter)
  }

  resolve(channelType: ChannelType): IChannelAdapter {
    const adapter = this.adapters.get(channelType)
    if (!adapter) {
      throw new AppError(
        'UNSUPPORTED_CHANNEL',
        `Channel type "${channelType}" is not supported`,
        400,
      )
    }
    return adapter
  }

  getSupportedChannels(): ChannelType[] {
    return Array.from(this.adapters.keys())
  }
}

export const channelRouter = new ChannelRouter()
