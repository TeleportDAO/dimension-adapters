import ADDRESSES from './coreAssets.json'
import { ChainBlocks, FetchOptions, FetchResultFees, } from "../adapters/types";

const TOPIC_Notify = 'event NotifyReward(address indexed from, address indexed reward, uint indexed epoch, uint amount)';

type TABI = {
  [k: string]: string;
}
const ABIs: TABI = {
  "allPairsLength": "uint256:allPairsLength",
  "allPairs": "function allPairs(uint256) view returns (address)"
}

const VOTER_ABI: TABI = {
  "length": "uint256:length",
  "pools": "function pools(uint256) view returns (address)",
  "gauges": "function gauges(address) view returns (address)",
  "bribes": "function bribes(address) view returns (address)"
}

export function getFeesExport({ VOTER_ADDRESS, FACTORY_ADDRESS, }: { VOTER_ADDRESS: string, FACTORY_ADDRESS: string }) {
  return async (timestamp: number, _: ChainBlocks, { createBalances, api, getLogs, }: FetchOptions): Promise<FetchResultFees> => {

    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const dailyBribesRevenue = createBalances()

    const lpTokens = await api.fetchList({ lengthAbi: ABIs.allPairsLength, itemAbi: ABIs.allPairs, target: FACTORY_ADDRESS });

    const [tokens0, tokens1] = await Promise.all(
      ['address:token0', 'address:token1'].map((method) => api.multiCall({ abi: method, calls: lpTokens, }))
    );


    const poolsGauges = await api.multiCall({ abi: VOTER_ABI.gauges, target: VOTER_ADDRESS, calls: lpTokens, });

    const voterGauges = poolsGauges.filter((_vg: string) => _vg !== ADDRESSES.null);

    const voterBribes = await api.multiCall({
      abi: VOTER_ABI.bribes, target: VOTER_ADDRESS,
      calls: voterGauges,
    });


    const tradefeeLogs = await getLogs({
      targets: lpTokens,
      flatten: false,
      eventAbi: 'event Fees (address indexed sender, uint256 amount0, uint256 amount1)'
    })

    const bribeAndFeeLogs = await getLogs({ targets: voterBribes, eventAbi: TOPIC_Notify, flatten: false, })
    bribeAndFeeLogs.forEach((e: any, idx: number) => {
      const voterGauge = voterGauges[idx].toLowerCase()
      e.forEach((l: any) => {
        if (l.from.toLowerCase() !== voterGauge)
          dailyBribesRevenue.add(l.reward, l.amount)
        else
          dailyRevenue.add(l.reward, l.amount)

      })
    })

    lpTokens.map((_: string, index: number) => {
      const token0 = tokens0[index]
      const token1 = tokens1[index]
      tradefeeLogs[index]
        .map((p: any) => {
          dailyFees.add(token0, p.amount0)
          dailyFees.add(token1, p.amount1)
        })
    });

    return { dailyFees, dailyRevenue: dailyRevenue, dailyHoldersRevenue: dailyRevenue, dailyBribesRevenue, timestamp, };
  }
}
