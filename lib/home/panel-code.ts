// Shared by lazy rendering and code-only warmup; does not mount panels or fetch feeds.
export const loadOptionsCode=()=>import('@/components/OptionsContent');
export const loadTransportSelectorCode=()=>import('@/components/TransportSelectorPanel');
export const loadBusDetailsCode=()=>import('@/components/BusDetailsPanel');
export const loadTrainDetailsCode=()=>import('@/components/TrainDetailsPanel');
export function warmPanelCode(){
  // Rail details are loaded on selection; do not parse them during bus startup.
  return Promise.allSettled([loadOptionsCode(),loadTransportSelectorCode(),loadBusDetailsCode()]);
}
