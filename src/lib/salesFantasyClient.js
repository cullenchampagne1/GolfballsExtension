import { sendBackgroundMessage } from './backgroundMessage.js';

export async function fetchSalesFantasySnapshot(dispatch = sendBackgroundMessage) {
  const response = await dispatch('salesFantasySnapshot', {});
  const snapshot = response?.snapshot;
  if (!snapshot || !Array.isArray(snapshot.daily_scores) || !Array.isArray(snapshot.weeks)) {
    throw new Error('The Sales Fantasy server returned an invalid activity snapshot');
  }
  return snapshot;
}
