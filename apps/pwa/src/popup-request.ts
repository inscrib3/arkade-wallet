export type PopupRequest =
  | { type: 'connect'; origin: string; network?: 'bitcoin' | 'mutinynet' }
  | { type: 'send'; origin: string; address: string; amount: number }
  | { type: 'sendAsset'; origin: string; address: string; assets: Array<{ assetId: string; amount: number }>; bitcoinAmount?: number };
