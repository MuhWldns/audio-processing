export function createImpulseResponse(context: BaseAudioContext, seconds: number, decay: number) {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }

  return impulse;
}
