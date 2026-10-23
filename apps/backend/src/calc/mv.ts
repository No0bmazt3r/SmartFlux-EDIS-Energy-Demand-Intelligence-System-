// Measurement and verification (proposal §15.9): did an approved action save what was predicted?
// Difference-in-differences against the machine's peers, so weather and traffic cancel out.
import type { Reading } from "./fault.ts";

export const MIN_POST_DAYS = 10; // ponytail: the docs said "2 post-action weeks"; 10 days lets a Tue service verify by the second Sunday
export const VERIFIED_SHARE = 0.7;

export type MvInput = {
  machine: { pre: Reading; post: Reading };
  peers: { pre: Reading; post: Reading }; // mean of same-type peers
  predicted_rm_per_month: number; cycles_per_month: number; unit_cost_rm: number; post_days: number;
};

export function mvCheck(i: MvInput) {
  const dMachine = i.machine.pre.value - i.machine.post.value;
  const dPeers = i.peers.pre.value - i.peers.post.value;
  const realisedUnit = dMachine - dPeers;
  const se = Math.sqrt(i.machine.pre.se ** 2 + i.machine.post.se ** 2 + i.peers.pre.se ** 2 + i.peers.post.se ** 2);
  const toRm = (x: number) => x * i.cycles_per_month * i.unit_cost_rm;
  const realised = toRm(realisedUnit), band = toRm(2 * se);
  const verdict =
    i.post_days < MIN_POST_DAYS ? "not_yet"
    : realised - band > 0 && realised >= VERIFIED_SHARE * i.predicted_rm_per_month ? "verified"
    : "not_achieved";
  return {
    verdict, realised_per_cycle: realisedUnit, machine_change: dMachine, peer_change: dPeers,
    realised_rm_per_month: realised, band_rm_per_month: band, predicted_rm_per_month: i.predicted_rm_per_month,
    share_of_prediction: i.predicted_rm_per_month ? realised / i.predicted_rm_per_month : 0, post_days: i.post_days,
  };
}

export type MvResult = ReturnType<typeof mvCheck>;
